/**
 * Seeds Phase 2 RTI sample + template data from data/rti_seed.json.
 * Idempotent: sample RTIs (internal_ref SAMPLE-RTI-*) cascade-delete their
 * appeals; reminders titled 'Sample: …' and the seeded templates are replaced.
 *
 *   npm run db:seed-rti   (run AFTER npm run db:migrate)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "pg";
import { loadEnv, makeClient, requireDatabaseUrl } from "./db";
import { computeRtiDeadlines } from "../lib/rti-deadlines";
import { DEFAULT_DEADLINE_RULES } from "../lib/constants";

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, "..", "data", "rti_seed.json");

interface SeedFile {
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

async function main() {
  if (!existsSync(DATA)) {
    console.error("✗ data/rti_seed.json not found.");
    process.exit(1);
  }
  const seed = JSON.parse(readFileSync(DATA, "utf-8")) as SeedFile;
  const url = requireDatabaseUrl();
  const client = makeClient(url);
  await client.connect();
  console.log("→ Connected. Seeding RTI sample + template data…\n");

  try {
    await client.query("begin");

    // ---- Clean previous sample rows (idempotent) --------------------------
    await client.query("delete from rti_applications where internal_ref like 'SAMPLE-RTI-%'");
    await client.query("delete from reminders where entity_type = 'rti' and title like 'Sample:%'");
    const templateTitles = seed.templates.map((t) => t.title);
    await client.query("delete from templates where title = any($1::text[])", [templateTitles]);

    // ---- Templates --------------------------------------------------------
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

    // ---- RTIs (compute statutory deadlines) -------------------------------
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
        ? await client.query<{ id: string }>("select id from wards where new_no=$1", [r.ward_no])
        : null;

      const res = await client.query<{ id: string }>(
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
      );
      const newId = res.rows[0]?.id;
      if (newId) rtiId.set(r.ref, newId);
    }

    // ---- First appeals ----------------------------------------------------
    const firstAppealId = new Map<string, string>(); // rti_ref → latest appeal id
    for (const fa of seed.first_appeals) {
      const id = rtiId.get(fa.rti_ref);
      if (!id) continue;
      const faaOrderDue = fa.date_filed
        ? new Date(new Date(fa.date_filed).getTime() + DEFAULT_DEADLINE_RULES.faaDisposalDays * 86_400_000)
            .toISOString()
            .slice(0, 10)
        : null;
      const res = await client.query<{ id: string }>(
        `insert into rti_first_appeals
           (rti_id, grounds, grounds_detail, date_drafted, date_filed, faa_order_due, faa_order_date, decision_summary, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [
          id, fa.grounds ?? [], fa.grounds_detail ?? null, fa.date_drafted ?? null,
          fa.date_filed ?? null, faaOrderDue, fa.faa_order_date ?? null,
          fa.decision_summary ?? null, fa.date_filed ? "Filed" : "Draft",
        ],
      );
      const faId = res.rows[0]?.id;
      if (faId) firstAppealId.set(fa.rti_ref, faId);
    }

    // ---- Second appeals ---------------------------------------------------
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

    // ---- Reminders --------------------------------------------------------
    for (const rm of seed.reminders) {
      const id = rtiId.get(rm.rti_ref);
      await client.query(
        `insert into reminders (entity_type, entity_id, title, description, due_date, priority, channels)
         values ('rti',$1,$2,$3,$4,$5,'{In-app}')`,
        [id ?? null, rm.title, rm.description ?? null, rm.due_date ?? null, rm.priority ?? "Medium"],
      );
    }

    await client.query("commit");

    const counts = await tallies(client);
    console.log("✓ RTI seed complete.\n");
    console.log("  Templates:      ", counts.templates);
    console.log("  Sample RTIs:    ", counts.rtis, "(expect 5)");
    console.log("  First appeals:  ", counts.firstAppeals, "(expect 2)");
    console.log("  Second appeals: ", counts.secondAppeals, "(expect 1)");
    console.log("  RTI reminders:  ", counts.reminders, "(expect 3)");
    console.log("\n  ⚠ All RTIs are clearly marked SAMPLE — replace before real use.");
  } catch (err) {
    await client.query("rollback");
    console.error("\n✗ RTI seed failed (rolled back):\n", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function tallies(client: Client) {
  const one = async (sql: string) =>
    Number((await client.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
  return {
    templates: await one("select count(*) n from templates"),
    rtis: await one("select count(*) n from rti_applications where internal_ref like 'SAMPLE-RTI-%'"),
    firstAppeals: await one("select count(*) n from rti_first_appeals"),
    secondAppeals: await one("select count(*) n from rti_second_appeals"),
    reminders: await one("select count(*) n from reminders where entity_type='rti' and title like 'Sample:%'"),
  };
}

main();
