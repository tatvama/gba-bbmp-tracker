/**
 * Seeds sample complaints + the complaint template library (Phase 3).
 * Idempotent: sample complaints use internal_case_number DM-CMP-2026-9000xx and
 * are replaced on each run (cascading their replies/actions/timeline); templates
 * are replaced by title.
 *
 *   npm run db:seed-complaints   (run AFTER npm run db:migrate)
 */
import type { Client } from "pg";
import { loadEnv, makeClient, requireDatabaseUrl } from "./db";

loadEnv();

const d = (offset: number) => {
  const x = new Date();
  x.setDate(x.getDate() + offset);
  return x.toISOString().slice(0, 10);
};

interface Sample {
  ref: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  ward_no: number;
  given: string;
  next: string;
  reply?: { date: string; by: string; summary: string; satisfactory?: boolean };
  action?: { date: string; by: string; summary: string };
  escalation?: { level: string; reason: string };
  closure?: string;
}

const SAMPLES: Sample[] = [
  { ref: "DM-CMP-2026-900001", title: "SAMPLE: Broken stormwater drain cover near park gate", type: "Drain", status: "Filed", priority: "High", ward_no: 1, given: d(-12), next: d(-1) },
  { ref: "DM-CMP-2026-900002", title: "SAMPLE: Streetlight not working for 3 weeks", type: "Streetlight", status: "Reply Received", priority: "Medium", ward_no: 2, given: d(-25), next: d(2),
    reply: { date: d(-5), by: "AEE (Sample)", summary: "Work order issued; repair scheduled.", satisfactory: false } },
  { ref: "DM-CMP-2026-900003", title: "SAMPLE: Garbage not collected — black spot", type: "Garbage", status: "Action Taken Report Received", priority: "High", ward_no: 3, given: d(-30), next: d(-1),
    reply: { date: d(-15), by: "Health Officer (Sample)", summary: "Contractor instructed to resume daily collection." },
    action: { date: d(-3), by: "Health Officer (Sample)", summary: "Black spot cleared; bin placed. Verify on site." } },
  { ref: "DM-CMP-2026-900004", title: "SAMPLE: Footpath encroachment by vendors", type: "Encroachment", status: "Escalated", priority: "Urgent", ward_no: 4, given: d(-40), next: d(1),
    escalation: { level: "AEE", reason: "No action after two follow-ups." } },
  { ref: "DM-CMP-2026-900005", title: "SAMPLE: Pothole repair — poor quality work", type: "Road", status: "Resolved", priority: "Medium", ward_no: 5, given: d(-50), next: d(-30), closure: d(-2) },
];

const TEMPLATES: { title: string; kind: string; category: string; tone: string; language: string; body: string }[] = [
  { title: "Initial complaint letter", kind: "complaint", category: "Complaint", tone: "Formal", language: "English", body: "To the [OFFICER], [WARD]. Subject: [SUBJECT]. I wish to report [ISSUE] at [LOCATION]. Kindly take action and inform me of the steps taken." },
  { title: "Follow-up reminder", kind: "followup", category: "Complaint", tone: "Formal", language: "English", body: "This is a follow-up on complaint [CASE NUMBER] dated [DATE]. No action appears to have been taken. Kindly update the status." },
  { title: "No reply escalation", kind: "escalation", category: "Complaint", tone: "Strong", language: "English", body: "Despite complaint [CASE NUMBER] dated [DATE], no reply has been received within the prescribed time. I request escalation to [HIGHER OFFICER]." },
  { title: "Engineer non-response complaint", kind: "complaint", category: "Complaint", tone: "Strong", language: "English", body: "The engineer responsible for [WARD] has not responded to complaint [CASE NUMBER]. Kindly hold the officer accountable." },
  { title: "Action Taken Report request", kind: "complaint", category: "Complaint", tone: "Formal", language: "English", body: "Kindly provide the Action Taken Report for complaint [CASE NUMBER], including dates, work done, and responsible officer." },
  { title: "Site inspection request", kind: "complaint", category: "Complaint", tone: "Formal", language: "English", body: "I request a joint site inspection for complaint [CASE NUMBER] at [LOCATION] to verify the reported issue." },
  { title: "Reopen complaint after false closure", kind: "complaint", category: "Complaint", tone: "Strong", language: "English", body: "Complaint [CASE NUMBER] was marked closed but the issue at [LOCATION] persists. Kindly reopen and resolve it." },
  { title: "Convert complaint into RTI", kind: "rti_from_complaint", category: "RTI", tone: "Investigative", language: "English", body: "Under the RTI Act 2005, please provide: 1) the work order, 2) the contractor details, and 3) the action taken on complaint [CASE NUMBER]." },
  { title: "Kannada complaint", kind: "complaint", category: "Complaint", tone: "Formal", language: "Kannada", body: "[ಕನ್ನಡದಲ್ಲಿ ದೂರು] — [SUBJECT] ಕುರಿತು [WARD] ನಲ್ಲಿ ಕ್ರಮ ಕೈಗೊಳ್ಳಲು ಕೋರುತ್ತೇನೆ." },
  { title: "Bilingual complaint", kind: "complaint", category: "Complaint", tone: "Formal", language: "Bilingual", body: "[English complaint]\n----------\n[ಕನ್ನಡ ಅನುವಾದ]" },
];

async function main() {
  const client = makeClient(requireDatabaseUrl());
  await client.connect();
  console.log("→ Connected. Seeding sample complaints + templates…\n");
  try {
    await client.query("begin");

    await client.query("delete from public.complaints where internal_case_number like 'DM-CMP-2026-9000%'");
    await client.query("delete from public.templates where title = any($1::text[])", [TEMPLATES.map((t) => t.title)]);

    for (const s of SAMPLES) {
      const ward = await client.query<{ id: string }>("select id from wards where new_no=$1", [s.ward_no]);
      const wardId = ward.rows[0]?.id ?? null;
      const res = await client.query<{ id: string }>(
        `insert into complaints (internal_case_number, title, type, status, priority, ward_id,
            date_submitted, next_follow_up_date, next_action_date, latest_reply_summary, latest_reply_date,
            latest_action_taken_summary, latest_action_taken_date, escalation_level, closure_date, notes, reminder_flag)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13,$14,'SAMPLE complaint — illustrative only.',true)
         returning id`,
        [
          s.ref, s.title, s.type, s.status, s.priority, wardId, s.given, s.next,
          s.reply?.summary ?? null, s.reply?.date ?? null,
          s.action?.summary ?? null, s.action?.date ?? null,
          s.escalation?.level ?? null, s.closure ?? null,
        ],
      );
      const id = res.rows[0]?.id;
      if (!id) continue;

      await client.query("insert into complaint_timeline (complaint_id, event_type, title, summary) values ($1,'Created','Complaint created',$2)", [id, s.ref]);
      await client.query("insert into complaint_timeline (complaint_id, event_type, event_date, title) values ($1,'Filed',$2,'Complaint filed')", [id, s.given]);

      if (s.reply) {
        await client.query(
          "insert into complaint_replies (complaint_id, reply_date, replied_by_name, reply_summary, is_satisfactory) values ($1,$2,$3,$4,$5)",
          [id, s.reply.date, s.reply.by, s.reply.summary, s.reply.satisfactory ?? null],
        );
        await client.query("insert into complaint_timeline (complaint_id, event_type, event_date, title, summary) values ($1,'Reply Received',$2,'Reply received',$3)", [id, s.reply.date, s.reply.summary]);
      }
      if (s.action) {
        await client.query(
          "insert into complaint_action_taken (complaint_id, action_taken_date, action_taken_by_name, action_summary) values ($1,$2,$3,$4)",
          [id, s.action.date, s.action.by, s.action.summary],
        );
        await client.query("insert into complaint_timeline (complaint_id, event_type, event_date, title, summary) values ($1,'Action Taken',$2,'Action taken report',$3)", [id, s.action.date, s.action.summary]);
        await client.query("insert into reminders (entity_type, entity_id, title, due_date, reminder_type, priority, status, channels) values ('complaint',$1,'Verify site action',$2,'Verify site action','High','Pending','{In-app}')", [id, s.next]);
      }
      if (s.escalation) {
        await client.query(
          "insert into escalation_logs (entity_type, entity_id, to_level, reason, escalated_on, status) values ('complaint',$1,$2,$3,$4,'Open')",
          [id, s.escalation.level, s.escalation.reason, s.given],
        );
        await client.query("insert into complaint_timeline (complaint_id, event_type, title, summary) values ($1,'Escalation',$2,$3)", [id, `Escalated to ${s.escalation.level}`, s.escalation.reason]);
      }
      if (s.status === "Filed") {
        await client.query("insert into reminders (entity_type, entity_id, title, due_date, reminder_type, priority, status, channels) values ('complaint',$1,$2,$3,'Follow-up with engineer','High','Pending','{In-app}')", [id, `Follow up: ${s.title}`, s.next]);
      }
    }

    for (const t of TEMPLATES) {
      await client.query(
        "insert into templates (title, kind, category, legal_tone, language, body) values ($1,$2,$3,$4,$5,$6)",
        [t.title, t.kind, t.category, t.tone, t.language, t.body],
      );
    }

    await client.query("commit");
    const n = await tally(client);
    console.log("✓ Complaint seed complete.\n");
    console.log("  Sample complaints:", n.complaints, "(expect 5)");
    console.log("  Complaint templates:", n.templates, "(expect 10)");
    console.log("\n  ⚠ Sample complaints are marked SAMPLE — replace before real use.");
  } catch (err) {
    await client.query("rollback");
    console.error("\n✗ Complaint seed failed (rolled back):\n", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

async function tally(client: Client) {
  const one = async (sql: string) => Number((await client.query<{ n: string }>(sql)).rows[0]?.n ?? 0);
  return {
    complaints: await one("select count(*) n from complaints where internal_case_number like 'DM-CMP-2026-9000%'"),
    templates: await one("select count(*) n from templates where kind in ('complaint','followup','escalation','rti_from_complaint')"),
  };
}

main();
