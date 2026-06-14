/**
 * Seeds public.gba_wards from data/gba_369_wards.json (built by build_gba_369.ts).
 * Idempotent: clears and re-inserts the full 369-row set. Run after db:migrate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv, requireDatabaseUrl, makeClient } from "./db";

interface FlatWard {
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

async function main() {
  loadEnv();
  const client = makeClient(requireDatabaseUrl());
  await client.connect();

  const file = join(process.cwd(), "data", "gba_369_wards.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as { wards: FlatWard[] };
  const rows = data.wards;
  if (!rows?.length) throw new Error("No GBA wards found in data file.");

  await client.query("begin");
  await client.query("truncate table public.gba_wards");

  let n = 0;
  for (const w of rows) {
    await client.query(
      `insert into public.gba_wards
         (corporation_code, annexure, division, assembly_constituency, subdivision, ward_no, ward_name_en, ward_name_kn, legible)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        w.corporation_code,
        w.annexure,
        w.division,
        w.assembly_constituency,
        w.subdivision,
        w.ward_no,
        w.ward_name_en,
        w.ward_name_kn,
        w.legible,
      ],
    );
    n++;
  }
  await client.query("commit");

  // verification summary
  const summary = await client.query(
    `select corporation_code,
            count(*) as wards,
            count(distinct division) as divisions,
            count(distinct (division || '|' || subdivision)) as subdivisions
       from public.gba_wards group by corporation_code order by corporation_code`,
  );
  console.log(`✓ Seeded ${n} GBA wards`);
  for (const r of summary.rows as { corporation_code: string; wards: string; divisions: string; subdivisions: string }[]) {
    console.log(`  ${r.corporation_code.padEnd(10)} wards ${r.wards}  div ${r.divisions}  sub ${r.subdivisions}`);
  }
  const totals = await client.query(
    `select count(*) w, count(distinct (corporation_code||'|'||division)) d,
            count(distinct (corporation_code||'|'||division||'|'||subdivision)) s,
            count(*) filter (where not legible) as flagged
       from public.gba_wards`,
  );
  const t = totals.rows[0] as { w: string; d: string; s: string; flagged: string };
  console.log(`  TOTAL      wards ${t.w}  divisions ${t.d}  subdivisions ${t.s}  (${t.flagged} names flagged for review)`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
