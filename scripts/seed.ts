/**
 * Seeds the database from data/*.json (with sample fallback per spec §11).
 * Idempotent: upserts authoritative records by natural key; replaces seed/sample
 * contacts + complaints by their source marker.
 *
 *   npm run db:seed   (run AFTER npm run db:migrate)
 *
 * Ingests:
 *   - data/gba_structure.json   → 5 corporations (counts sum 369/50/150)
 *   - data/bbmp225_wards.json   → 30 divisions, 75 eng sub-divisions, 225 wards
 *                                 with AC-derived corporation
 *   - data/engineers_seed.json  → unverified seed contacts (PENDING / LOW)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { loadEnv, makeClient, requireDatabaseUrl } from "./db";
import { buildAcNumberToCorp, deriveCorporation } from "../lib/derive";
import { DESIGNATIONS } from "../lib/constants";
import {
  SAMPLE_GBA,
  SAMPLE_WARDS,
  SAMPLE_ENGINEERS,
  SAMPLE_COMPLAINTS,
} from "./sample";

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, "..", "data");

const SEED_CONTACT_SOURCE = "engineers_seed.json";
const SAMPLE_SOURCE = "sample";
const WARD_SOURCE = "BBMP Notified 225 Wards (Annexure-1)";

function readJson<T>(file: string, fallback: T): { data: T; usedFallback: boolean } {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) {
    console.warn(`  ! ${file} not found — using sample fallback.`);
    return { data: fallback, usedFallback: true };
  }
  return { data: JSON.parse(readFileSync(path, "utf-8")) as T, usedFallback: false };
}

interface WardRec {
  new_no: number;
  new_name: string;
  property_count?: number;
  zone?: string;
  ac: string;
  division: string;
  old_subdiv?: string;
  eng_subdiv: string;
  eng_subdiv_sl?: number;
  old_wards?: string[];
}
interface CorpRec {
  code: string;
  name: string;
  name_kn?: string | null;
  wards: number;
  divisions: number;
  subdivisions: number;
  annexure?: string;
  assembly_constituencies: string[];
}
interface EngSeed {
  name: string;
  designation: string;
  phone?: string;
  address?: string;
  verified?: boolean;
}

const DESIG_SET = new Set<string>(DESIGNATIONS);

async function main() {
  const url = requireDatabaseUrl();
  const client = makeClient(url);
  await client.connect();
  console.log("→ Connected. Seeding…\n");

  try {
    await client.query("begin");

    // ---- Load inputs -------------------------------------------------------
    const gba = readJson("gba_structure.json", SAMPLE_GBA);
    const wardsFile = readJson("bbmp225_wards.json", SAMPLE_WARDS);
    const engFile = readJson("engineers_seed.json", SAMPLE_ENGINEERS);
    const usingSample = gba.usedFallback || wardsFile.usedFallback;

    const corps = gba.data.corporations as CorpRec[];
    const wards = (wardsFile.data as { wards: WardRec[] }).wards;
    const engineers = (engFile.data as { by_eng_subdiv: Record<string, EngSeed> })
      .by_eng_subdiv;

    // ---- Derivation --------------------------------------------------------
    const acNumToCorp = buildAcNumberToCorp(corps);

    // ---- 1. Corporations ---------------------------------------------------
    for (const c of corps) {
      await client.query(
        `insert into corporations (code, name, ward_count, division_count, subdivision_count, assembly_constituencies, annexure)
         values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (code) do update set
           name=excluded.name, ward_count=excluded.ward_count,
           division_count=excluded.division_count, subdivision_count=excluded.subdivision_count,
           assembly_constituencies=excluded.assembly_constituencies, annexure=excluded.annexure`,
        [
          c.code, c.name, c.wards, c.divisions, c.subdivisions,
          c.assembly_constituencies, c.annexure ?? null,
        ],
      );
    }
    const corpId = await mapBy(client, "select code, id from corporations", "code");

    // ---- 2. Divisions (corporation derived from member wards) --------------
    const divCorp = new Map<string, Set<string>>();
    for (const w of wards) {
      const code = deriveCorporation(w.ac, acNumToCorp).code;
      if (!divCorp.has(w.division)) divCorp.set(w.division, new Set());
      if (code) divCorp.get(w.division)!.add(code);
    }
    for (const [name, codes] of divCorp) {
      const code = codes.size === 1 ? [...codes][0] : null;
      await client.query(
        `insert into divisions (name, corporation_id, corporation_derived)
         values ($1,$2,true)
         on conflict (name) do update set corporation_id=excluded.corporation_id, corporation_derived=true`,
        [name, code ? corpId.get(code) : null],
      );
    }
    const divId = await mapBy(client, "select name, id from divisions", "name");

    // ---- 3. Engineering sub-divisions --------------------------------------
    const subMeta = new Map<string, { division: string; sl: number | null }>();
    for (const w of wards) {
      if (!subMeta.has(w.eng_subdiv))
        subMeta.set(w.eng_subdiv, { division: w.division, sl: w.eng_subdiv_sl ?? null });
    }
    for (const [name, meta] of subMeta) {
      await client.query(
        `insert into eng_subdivisions (name, sl_no, division_id)
         values ($1,$2,$3)
         on conflict (name, division_id) do update set sl_no=excluded.sl_no`,
        [name, meta.sl, divId.get(meta.division) ?? null],
      );
    }
    const subRows = await client.query<{ name: string; division_id: string | null; id: string }>(
      "select name, division_id, id from eng_subdivisions",
    );
    const subId = new Map<string, string>(); // keyed by name (unique enough for our data)
    for (const r of subRows.rows) subId.set(r.name, r.id);

    // ---- 4. Wards ----------------------------------------------------------
    let normalisedCount = 0;
    for (const w of wards) {
      const d = deriveCorporation(w.ac, acNumToCorp);
      if (d.normalisedFromCombined) normalisedCount++;
      const noteParts: string[] = [];
      if (d.normalisedFromCombined)
        noteParts.push(
          `Corporation derived from AC number in combined source string "${w.ac}".`,
        );
      if (!w.old_wards || w.old_wards.length === 0)
        noteParts.push("Old-ward (BBMP-198) mapping not captured in source (scan-ambiguous).");

      const isSample = usingSample;
      await client.query(
        `insert into wards
           (new_no, new_name, property_count, zone, assembly_constituency, old_subdiv, old_wards,
            division_id, eng_subdivision_id, derived_corporation_id, derived_normalised,
            source, source_page, verification_status, confidence_score, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         on conflict (new_no) do update set
           new_name=excluded.new_name, property_count=excluded.property_count, zone=excluded.zone,
           assembly_constituency=excluded.assembly_constituency, old_subdiv=excluded.old_subdiv,
           old_wards=excluded.old_wards, division_id=excluded.division_id,
           eng_subdivision_id=excluded.eng_subdivision_id, derived_corporation_id=excluded.derived_corporation_id,
           derived_normalised=excluded.derived_normalised, source=excluded.source,
           verification_status=excluded.verification_status, confidence_score=excluded.confidence_score,
           notes=excluded.notes`,
        [
          w.new_no, w.new_name, w.property_count ?? null, w.zone ?? null, w.ac,
          w.old_subdiv ?? null, w.old_wards ?? [],
          divId.get(w.division) ?? null, subId.get(w.eng_subdiv) ?? null,
          d.code ? corpId.get(d.code) : null, d.normalisedFromCombined,
          isSample ? SAMPLE_SOURCE : WARD_SOURCE, w.eng_subdiv_sl ? `sl ${w.eng_subdiv_sl}` : null,
          isSample ? "UNKNOWN" : "VERIFIED", isSample ? "LOW" : "HIGH",
          noteParts.join(" ") || null,
        ],
      );
    }

    // ---- 5. Seed / sample contacts (replace by source marker) --------------
    const contactSource = usingSample ? SAMPLE_SOURCE : SEED_CONTACT_SOURCE;
    await client.query("delete from contacts where source = $1", [contactSource]);
    let contactCount = 0;
    for (const [subName, e] of Object.entries(engineers)) {
      const subdivision = subId.get(subName) ?? findSubByLooseName(subId, subName);
      const designation = DESIG_SET.has(e.designation) ? e.designation : "Ward Engineer";
      const jurisdiction =
        designation !== e.designation ? `Original designation in source: "${e.designation}".` : null;
      // derive division + corporation for this sub-division
      const subRow = subRows.rows.find((r) => r.id === subdivision);
      const division_id = subRow?.division_id ?? null;
      let corporation_id: string | null = null;
      if (division_id) {
        const dc = await client.query<{ corporation_id: string | null }>(
          "select corporation_id from divisions where id = $1",
          [division_id],
        );
        corporation_id = dc.rows[0]?.corporation_id ?? null;
      }
      const verification = usingSample ? (e.verified ? "VERIFIED" : "PENDING") : "PENDING";
      await client.query(
        `insert into contacts
           (full_name, designation, eng_subdivision_id, division_id, corporation_id,
            office_address, phone, whatsapp, jurisdiction_notes,
            source, verification_status, confidence_score, public_notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'LOW',$12)`,
        [
          e.name, designation, subdivision ?? null, division_id, corporation_id,
          e.address ?? null, e.phone ?? null, e.phone ?? null, jurisdiction,
          contactSource, verification,
          "Unverified seed from older official BBMP directory — verify before official use.",
        ],
      );
      contactCount++;
    }

    // ---- 6. Sample complaints (only when running on sample data) -----------
    if (usingSample) {
      await client.query("delete from complaints where complaint_number like 'SAMPLE-%' or rti_number like 'RTI-SAMPLE-%'");
      for (const c of SAMPLE_COMPLAINTS) {
        const wid = await client.query<{ id: string }>("select id from wards where new_no=$1", [c.ward_new_no]);
        await client.query(
          `insert into complaints (title, type, ward_id, status, complaint_number, rti_number, reminder_flag)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [c.title, c.type, wid.rows[0]?.id ?? null, c.status, c.complaint_number ?? null, c.rti_number ?? null, c.reminder_flag],
        );
      }
    }

    // ---- 7. Source documents ----------------------------------------------
    await client.query("delete from source_documents where file_name in ('bbmp225_wards.json','gba_structure.json','engineers_seed.json')");
    await client.query(
      `insert into source_documents (title, file_name, document_type, notes) values
        ('BBMP Notified 225 Wards (Annexure-1)','bbmp225_wards.json','Notification','Authoritative, fully validated — 225 wards, 75 engineering sub-divisions.'),
        ('GBA 5-Corporation Division & Sub-Division Details','gba_structure.json','Memo','Memo dated 06-03-2026. Ward names Kannada-only — import pending.'),
        ('BBMP Engineer Directory (seed)','engineers_seed.json','Directory','Unverified contacts from 2014–2017 BBMP directories.')`,
    );

    await client.query("commit");

    // ---- Report ------------------------------------------------------------
    const counts = await tallies(client);
    console.log("✓ Seed complete.\n");
    console.log("  Corporations:", counts.corporations, "(expect 5)");
    console.log("  Divisions:   ", counts.divisions);
    console.log("  Eng sub-divs:", counts.subdivisions, "(expect 75)");
    console.log("  Wards:       ", counts.wards, "(expect 225)");
    console.log("  Contacts:    ", contactCount, "(seed)");
    console.log("  AC-normalised wards (combined AC string):", normalisedCount);
    console.log(
      "  Corp count sums →",
      `wards ${counts.sumWards} (expect 369),`,
      `divisions ${counts.sumDiv} (expect 50),`,
      `subdivisions ${counts.sumSub} (expect 150)`,
    );
    const unmapped = await client.query<{ n: string }>(
      "select count(*) n from wards where derived_corporation_id is null",
    );
    console.log("  Wards with NO derived corporation (flagged):", unmapped.rows[0]?.n);
    if (usingSample) console.log("\n  ⚠ Ran on SAMPLE fallback data (real JSON not found).");
  } catch (err) {
    await client.query("rollback");
    console.error("\n✗ Seed failed (rolled back):\n", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function mapBy(client: Client, sql: string, key: string): Promise<Map<string, string>> {
  const res = await client.query(sql);
  const m = new Map<string, string>();
  for (const row of res.rows) m.set(row[key], row.id);
  return m;
}

/** Loose match: trim + case-insensitive on sub-division name. */
function findSubByLooseName(subId: Map<string, string>, name: string): string | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(name);
  for (const [k, v] of subId) if (norm(k) === target) return v;
  return undefined;
}

async function tallies(client: Client) {
  const one = async (sql: string) =>
    Number((await client.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
  return {
    corporations: await one("select count(*) n from corporations"),
    divisions: await one("select count(*) n from divisions"),
    subdivisions: await one("select count(*) n from eng_subdivisions"),
    wards: await one("select count(*) n from wards"),
    sumWards: await one("select coalesce(sum(ward_count),0) n from corporations"),
    sumDiv: await one("select coalesce(sum(division_count),0) n from corporations"),
    sumSub: await one("select coalesce(sum(subdivision_count),0) n from corporations"),
  };
}

main();
