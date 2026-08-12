const fs = typeof window === "undefined" ? eval('require("fs")') : null;
const path = typeof window === "undefined" ? eval('require("path")') : null;
const pg = typeof window === "undefined" ? eval('require("pg")') : null;
import type { StartupTask } from "./types";
import { StartupLogger } from "./logger";
import { buildAcNumberToCorp, deriveCorporation } from "@/lib/derive";
import { DESIGNATIONS } from "@/lib/constants";
import { computeRtiDeadlines } from "@/lib/rti-deadlines";
import { DEFAULT_DEADLINE_RULES } from "@/lib/constants";
import {
  SAMPLE_GBA,
  SAMPLE_WARDS,
  SAMPLE_ENGINEERS,
  SAMPLE_COMPLAINTS,
} from "@/scripts/sample";

const SEED_CONTACT_SOURCE = "engineers_seed.json";
const SAMPLE_SOURCE = "sample";
const WARD_SOURCE = "BBMP Notified 225 Wards (Annexure-1)";
const DESIG_SET = new Set<string>(DESIGNATIONS);

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
interface FlatGbaWard {
  corporation_code: string;
  annexure: string | null;
  division: string;
  assembly_constituency: string | null;
  subdivision: string;
  ward_no: number;
  ward_name_en: string;
  ward_name_kn: string;
  legible: boolean;
}
interface RtiSeedFile {
  templates: {
    title: string;
    kind?: string;
    category?: string;
    department?: string;
    legal_tone?: string;
    language?: string;
    body?: string;
    default_questions?: string[];
    variables?: unknown;
  }[];
  rtis: {
    ref: string;
    subject: string;
    category?: string;
    status: string;
    priority?: string;
    satisfaction_status?: string;
    public_authority?: string;
    department?: string;
    pio_name?: string;
    pio_designation?: string;
    faa_name?: string;
    faa_designation?: string;
    ward_no?: number;
    date_filed?: string;
    date_received?: string;
    reply_date?: string;
    first_appeal_decision_date?: string;
    filing_mode?: string;
    online_reg_no?: string;
    info_requested?: string;
    reply_summary?: string;
    is_life_liberty?: boolean;
    public_notes?: string;
  }[];
  first_appeals: {
    rti_ref: string;
    grounds?: string[];
    grounds_detail?: string;
    date_drafted?: string;
    date_filed?: string;
    faa_order_date?: string;
    decision_summary?: string;
  }[];
  second_appeals: {
    rti_ref: string;
    reason?: string[];
    reason_detail?: string;
    commission_name?: string;
    filing_date?: string;
    diary_number?: string;
  }[];
  reminders: {
    rti_ref: string;
    title: string;
    description?: string;
    due_date?: string;
    priority?: string;
  }[];
}

export class DatabaseSeedingTask implements StartupTask {
  name = "Database Seeding";
  critical = false;

  async run(): Promise<void> {
    const isProd = process.env.NODE_ENV === "production";
    const seedOnStartup = process.env.SEED_ON_STARTUP === "true";

    if (isProd && !seedOnStartup) {
      StartupLogger.info("Database seeding skipped in production (use SEED_ON_STARTUP=true to force).");
      return;
    }

    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set.");
    }

    if (!pg) {
      throw new Error("pg module is not available.");
    }
    // TLS is opt-in via DB_SSL: requesting it from a server that does not offer
    // it fails the connection outright, and the current one does not.
    const client = new pg.Client({
      connectionString: url,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    });

    await client.connect();

    try {
      // 1. Check if corporations/wards table is empty
      const wardsCheck = await client.query("SELECT COUNT(*) FROM public.wards;");
      const wardsCount = parseInt(wardsCheck.rows[0].count, 10);
      if (wardsCount === 0) {
        StartupLogger.info("Wards table is empty. Running main seed script...");
        await this.seedMainWards(client);
      }

      // 2. Check if gba_wards table is empty
      const gbaCheck = await client.query("SELECT COUNT(*) FROM public.gba_wards;");
      const gbaCount = parseInt(gbaCheck.rows[0].count, 10);
      if (gbaCount === 0) {
        StartupLogger.info("GBA wards table is empty. Running GBA seed script...");
        await this.seedGbaWards(client);
      }

      // 3. Check if templates table is empty
      const templatesCheck = await client.query("SELECT COUNT(*) FROM public.templates;");
      const templatesCount = parseInt(templatesCheck.rows[0].count, 10);
      if (templatesCount === 0) {
        StartupLogger.info("Templates table is empty. Running RTI seed script...");
        await this.seedRtiData(client);
      }
    } finally {
      await client.end().catch(() => {});
    }
  }

  private readJson<T>(file: string, fallback: T): { data: T; usedFallback: boolean } {
    if (!path || !fs) {
      return { data: fallback, usedFallback: true };
    }
    const dataPath = path.join(process.cwd(), "data", file);
    if (!fs.existsSync(dataPath)) {
      return { data: fallback, usedFallback: true };
    }
    try {
      return { data: JSON.parse(fs.readFileSync(dataPath, "utf-8")) as T, usedFallback: false };
    } catch {
      return { data: fallback, usedFallback: true };
    }
  }

  private async mapBy(client: any, sql: string, key: string): Promise<Map<string, string>> {
    const res = await client.query(sql);
    const m = new Map<string, string>();
    for (const row of res.rows) m.set(row[key], row.id);
    return m;
  }

  private findSubByLooseName(subId: Map<string, string>, name: string): string | undefined {
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const target = norm(name);
    for (const [k, v] of subId) if (norm(k) === target) return v;
    return undefined;
  }

  private async seedMainWards(client: any): Promise<void> {
    await client.query("BEGIN;");
    try {
      const gba = this.readJson("gba_structure.json", SAMPLE_GBA);
      const wardsFile = this.readJson("bbmp225_wards.json", SAMPLE_WARDS);
      const engFile = this.readJson("engineers_seed.json", SAMPLE_ENGINEERS);
      const usingSample = gba.usedFallback || wardsFile.usedFallback;

      const corps = gba.data.corporations as CorpRec[];
      const wards = (wardsFile.data as { wards: WardRec[] }).wards;
      const engineers = (engFile.data as { by_eng_subdiv: Record<string, EngSeed> }).by_eng_subdiv;

      const acNumToCorp = buildAcNumberToCorp(corps);

      // Corporations
      for (const c of corps) {
        await client.query(
          `insert into corporations (code, name, ward_count, division_count, subdivision_count, assembly_constituencies, annexure)
           values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (code) do update set
             name=excluded.name, ward_count=excluded.ward_count,
             division_count=excluded.division_count, subdivision_count=excluded.subdivision_count,
             assembly_constituencies=excluded.assembly_constituencies, annexure=excluded.annexure`,
          [c.code, c.name, c.wards, c.divisions, c.subdivisions, c.assembly_constituencies, c.annexure ?? null],
        );
      }
      const corpId = await this.mapBy(client, "select code, id from corporations", "code");

      // Divisions
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
      const divId = await this.mapBy(client, "select name, id from divisions", "name");

      // Engineering subdivisions
      const subMeta = new Map<string, { division: string; sl: number | null }>();
      for (const w of wards) {
        if (!subMeta.has(w.eng_subdiv)) {
          subMeta.set(w.eng_subdiv, { division: w.division, sl: w.eng_subdiv_sl ?? null });
        }
      }
      for (const [name, meta] of subMeta) {
        await client.query(
          `insert into eng_subdivisions (name, sl_no, division_id)
           values ($1,$2,$3)
           on conflict (name, division_id) do update set sl_no=excluded.sl_no`,
          [name, meta.sl, divId.get(meta.division) ?? null],
        );
      }
      const subRows = (await client.query(
        "select name, division_id, id from eng_subdivisions",
      )) as { rows: { name: string; division_id: string | null; id: string }[] };
      const subId = new Map<string, string>();
      for (const r of subRows.rows) subId.set(r.name, r.id);

      // Wards
      let normalisedCount = 0;
      for (const w of wards) {
        const d = deriveCorporation(w.ac, acNumToCorp);
        if (d.normalisedFromCombined) normalisedCount++;
        const noteParts: string[] = [];
        if (d.normalisedFromCombined) {
          noteParts.push(`Corporation derived from AC number in combined source string "${w.ac}".`);
        }
        if (!w.old_wards || w.old_wards.length === 0) {
          noteParts.push("Old-ward (BBMP-198) mapping not captured in source (scan-ambiguous).");
        }

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

      // Contacts
      const contactSource = usingSample ? SAMPLE_SOURCE : SEED_CONTACT_SOURCE;
      await client.query("delete from contacts where source = $1", [contactSource]);
      for (const [subName, e] of Object.entries(engineers)) {
        const subdivision = subId.get(subName) ?? this.findSubByLooseName(subId, subName);
        const designation = DESIG_SET.has(e.designation) ? e.designation : "Ward Engineer";
        const jurisdiction = designation !== e.designation ? `Original designation in source: "${e.designation}".` : null;
        const subRow = subRows.rows.find((r: { id: string }) => r.id === subdivision);
        const division_id = subRow?.division_id ?? null;
        let corporation_id: string | null = null;
        if (division_id) {
          const dc = (await client.query(
            "select corporation_id from divisions where id = $1",
            [division_id],
          )) as { rows: { corporation_id: string | null }[] };
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
      }

      // Sample complaints
      if (usingSample) {
        await client.query("delete from complaints where complaint_number like 'SAMPLE-%' or rti_number like 'RTI-SAMPLE-%'");
        for (const c of SAMPLE_COMPLAINTS) {
          const wid = (await client.query("select id from wards where new_no=$1", [c.ward_new_no])) as { rows: { id: string }[] };
          await client.query(
            `insert into complaints (title, type, ward_id, status, complaint_number, rti_number, reminder_flag)
             values ($1,$2,$3,$4,$5,$6,$7)`,
            [c.title, c.type, wid.rows[0]?.id ?? null, c.status, c.complaint_number ?? null, c.rti_number ?? null, c.reminder_flag],
          );
        }
      }

      // Source documents
      await client.query("delete from source_documents where file_name in ('bbmp225_wards.json','gba_structure.json','engineers_seed.json')");
      await client.query(
        `insert into source_documents (title, file_name, document_type, notes) values
          ('BBMP Notified 225 Wards (Annexure-1)','bbmp225_wards.json','Notification','Authoritative, fully validated — 225 wards, 75 engineering sub-divisions.'),
          ('GBA 5-Corporation Division & Sub-Division Details','gba_structure.json','Memo','Memo dated 06-03-2026. Ward names Kannada-only — import pending.'),
          ('BBMP Engineer Directory (seed)','engineers_seed.json','Directory','Unverified contacts from 2014–2017 BBMP directories.')`,
      );

      await client.query("COMMIT;");
      StartupLogger.info("✓ Main seed complete.");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    }
  }

  private async seedGbaWards(client: any): Promise<void> {
    if (!path || !fs) return;
    const file = path.join(process.cwd(), "data", "gba_369_wards.json");
    if (!fs.existsSync(file)) {
      StartupLogger.warn("Database Seeding", "gba_369_wards.json not found. Skipping GBA seed.");
      return;
    }
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { wards: FlatGbaWard[] };
    const rows = data.wards;
    if (!rows?.length) return;

    await client.query("BEGIN;");
    try {
      await client.query("truncate table public.gba_wards cascade");
      for (const w of rows) {
        await client.query(
          `insert into public.gba_wards
             (corporation_code, annexure, division, assembly_constituency, subdivision, ward_no, ward_name_en, ward_name_kn, legible)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            w.corporation_code, w.annexure, w.division, w.assembly_constituency,
            w.subdivision, w.ward_no, w.ward_name_en, w.ward_name_kn, w.legible,
          ],
        );
      }
      await client.query("COMMIT;");
      StartupLogger.info(`✓ GBA seed complete. Seeded ${rows.length} wards.`);
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    }
  }

  private async seedRtiData(client: any): Promise<void> {
    if (!path || !fs) return;
    const file = path.join(process.cwd(), "data", "rti_seed.json");
    if (!fs.existsSync(file)) {
      StartupLogger.warn("Database Seeding", "rti_seed.json not found. Skipping RTI seed.");
      return;
    }
    const seed = JSON.parse(fs.readFileSync(file, "utf-8")) as RtiSeedFile;

    await client.query("BEGIN;");
    try {
      await client.query("delete from rti_applications where internal_ref like 'SAMPLE-RTI-%'");
      await client.query("delete from reminders where entity_type = 'rti' and title like 'Sample:%'");
      const templateTitles = seed.templates.map((t) => t.title);
      await client.query("delete from templates where title = any($1::text[])", [templateTitles]);

      // Templates
      for (const t of seed.templates) {
        await client.query(
          `insert into templates (title, kind, category, department, legal_tone, language, body, default_questions, variables)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [
            t.title, t.kind ?? null, t.category ?? null, t.department ?? null,
            t.legal_tone ?? null, t.language ?? null, t.body ?? null,
            t.default_questions ?? [], JSON.stringify(t.variables ?? []),
          ],
        );
      }

      // RTIs
      const rtiId = new Map<string, string>();
      for (const r of seed.rtis) {
        const d = computeRtiDeadlines(
          {
            dateReceived: r.date_received ?? null,
            dateFiled: r.date_filed ?? null,
            isLifeLiberty: r.is_life_liberty ?? false,
            replyDate: r.reply_date ?? null,
            firstAppealDecisionDate: r.first_appeal_decision_date ?? null,
          },
          DEFAULT_DEADLINE_RULES,
        );
        const ward = r.ward_no
          ? ((await client.query("select id from wards where new_no=$1", [r.ward_no])) as { rows: { id: string }[] })
          : null;

        const res = (await client.query(
          `insert into rti_applications
             (internal_ref, subject, category, status, priority, satisfaction_status,
              public_authority, department, pio_name, pio_designation, faa_name, faa_designation,
              ward_id, date_filed, date_received, reply_date, filing_mode, online_reg_no,
              info_requested, reply_summary, is_life_liberty, public_notes,
              normal_due, life_liberty_due, first_appeal_due, second_appeal_due)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
           returning id`,
          [
            r.ref, r.subject, r.category ?? null, r.status, r.priority ?? "Medium",
            r.satisfaction_status ?? null, r.public_authority ?? null, r.department ?? null,
            r.pio_name ?? null, r.pio_designation ?? null, r.faa_name ?? null, r.faa_designation ?? null,
            ward?.rows[0]?.id ?? null, r.date_filed ?? null, r.date_received ?? null, r.reply_date ?? null,
            r.filing_mode ?? null, r.online_reg_no ?? null, r.info_requested ?? null, r.reply_summary ?? null,
            r.is_life_liberty ?? false, r.public_notes ?? null,
            d.normalDue, d.lifeLibertyDue, d.firstAppealDue, d.secondAppealDue,
          ],
        )) as { rows: { id: string }[] };
        const newId = res.rows[0]?.id;
        if (newId) rtiId.set(r.ref, newId);
      }

      // First appeals
      const firstAppealId = new Map<string, string>();
      for (const fa of seed.first_appeals) {
        const id = rtiId.get(fa.rti_ref);
        if (!id) continue;
        const faaOrderDue = fa.date_filed
          ? new Date(new Date(fa.date_filed).getTime() + DEFAULT_DEADLINE_RULES.faaDisposalDays * 86_400_000)
              .toISOString()
              .slice(0, 10)
          : null;
        const res = (await client.query(
          `insert into rti_first_appeals
             (rti_id, grounds, grounds_detail, date_drafted, date_filed, faa_order_due, faa_order_date, decision_summary, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
          [
            id, fa.grounds ?? [], fa.grounds_detail ?? null, fa.date_drafted ?? null,
            fa.date_filed ?? null, faaOrderDue, fa.faa_order_date ?? null,
            fa.decision_summary ?? null, fa.date_filed ? "Filed" : "Draft",
          ],
        )) as { rows: { id: string }[] };
        const faId = res.rows[0]?.id;
        if (faId) firstAppealId.set(fa.rti_ref, faId);
      }

      // Second appeals
      for (const sa of seed.second_appeals) {
        const id = rtiId.get(sa.rti_ref);
        if (!id) continue;
        await client.query(
          `insert into rti_second_appeals
             (rti_id, first_appeal_id, commission_name, reason, reason_detail, filing_date, diary_number, status)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id, firstAppealId.get(sa.rti_ref) ?? null, sa.commission_name ?? null,
            sa.reason ?? [], sa.reason_detail ?? null, sa.filing_date ?? null,
            sa.diary_number ?? null, sa.filing_date ? "Filed" : "Draft",
          ],
        );
      }

      // Reminders
      for (const rm of seed.reminders) {
        const id = rtiId.get(rm.rti_ref);
        await client.query(
          `insert into reminders (entity_type, entity_id, title, description, due_date, priority, channels)
           values ('rti',$1,$2,$3,$4,$5,'{In-app}')`,
          [id ?? null, rm.title, rm.description ?? null, rm.due_date ?? null, rm.priority ?? "Medium"],
        );
      }

      await client.query("COMMIT;");
      StartupLogger.info("✓ RTI seed complete.");
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    }
  }
}
