import "server-only";
/**
 * The overdue-alert sweeper — request-free (mirrors lib/complaints/
 * escalation-scheduler.ts exactly: no cookies/session, so it can run from
 * instrumentation.ts's in-process interval with no HTTP request in flight).
 *
 * sweepOverdueAlerts() finds every open complaint whose next_follow_up_date has
 * passed — the SAME definition getNotificationDigest() (lib/queries.ts) already
 * uses for its "overdue complaints" section, deliberately not re-derived.
 *
 * WHO gets alerted, and how: this is a per-OFFICER digest, not one email per
 * complaint. "Accountable officer" is derived from real send history rather
 * than a separate marking a user maintains — lib/mail/send.ts records, on
 * every letter actually sent, exactly who it went to (letter_emails.recipients,
 * migration 0049: [{name, designation, email, source: "directory"|"manual",
 * role: "to"|"cc"}]). That IS the checklist the "Email this letter" panel
 * shows — officers ticked from the ward/division directory list, or typed in
 * under "Add an officer not in the system" — already durable per send, with no
 * new table needed. A complaint nobody has ever been emailed about has nobody
 * to alert, which is the correct behaviour, not a gap: "only for those marked"
 * means exactly that.
 *
 * For each candidate complaint, the MOST RECENT 'sent' letter_emails row's
 * role="to" recipients are taken as who currently owns it — not every officer
 * ever sent a letter, so a case re-addressed to a new officer after escalation
 * does not keep alerting the old one. One officer can own several overdue
 * complaints; those are grouped into ONE job so the officer gets ONE digest
 * email listing all of them, not a flood of one-per-case alerts.
 *
 * QUEUES a job rather than sending inline, and deliberately imports nothing
 * from lib/mail/* here: this module is reached from instrumentation.ts's import
 * graph (via lib/startup/jobs.ts), which bundles under the "more restrictive
 * resolution rules" instrumentation.ts's own top comment describes. A previous
 * version of this file imported lib/mail/overdue-alert.ts directly and sent
 * inline — nodemailer's SMTP transport needs Node builtins (net, tls, dns,
 * crypto, fs, stream, os, child_process) that resolution context can't
 * provide, and adding it to next.config.mjs's serverExternalPackages did NOT
 * fix it either (that config apparently isn't consulted for this specific
 * entry point). The actual mail-sending code (lib/mail/overdue-alert.ts,
 * lib/mail/transport.ts) is only ever imported from
 * lib/jobs/handlers/email-send.ts, which is only ever imported from
 * request-triggered code (lib/jobs/handlers/index.ts, pulled in by
 * lib/actions/mail.ts et al.) — exactly the same reason lib/jobs/runner.ts's
 * dispatchJob() looks up handlers from the in-memory registry instead of
 * importing them, per its own extensive comment. That constraint is also why
 * grouping-by-officer happens HERE in plain data (no crypto-derived id, no
 * hashing) rather than via any helper that might pull in something
 * Node-builtin-dependent.
 *
 * Since there's no request in flight here, startJob()'s normal path (insert +
 * after(() => dispatchJob(...))) isn't available either — after() requires an
 * active request/action context. So this inserts the background_jobs row
 * directly with created_by null (a "system" job, no human triggered it) and
 * relies on sweepBackgroundJobs()'s queued-with-no-owner dispatch loop
 * (lib/jobs/runner.ts) to pick it up on its own next tick.
 *
 * De-duplication is date-based and per-complaint, not per-officer: at most one
 * digest mention per complaint per calendar day (checked against both
 * letter_emails — already sent today — and in-flight background_jobs — queued
 * today, not yet sent). A complaint that stays overdue for a week is mentioned
 * once a day, in whichever digest covers it that day, not once per sweep tick.
 */
import type { DbClient } from "@/lib/db";
import { createAdminClient } from "@/lib/db";
import { COMPLAINT_OPEN_STATUSES } from "@/lib/constants";

const OVERDUE_ALERT_KIND = "Overdue alert";
/** Bound each sweep tick's work, same reasoning as escalation-scheduler.ts's
 *  own .limit(50) — a runaway backlog is processed over several ticks rather
 *  than blocking one tick indefinitely. */
const BATCH_LIMIT = 50;

export interface OverdueAlertSweepResult {
  /** Overdue complaints newly folded into a digest job this tick. */
  queued: number;
  /** Overdue complaints skipped because today's digest (sent or in-flight)
   *  already covers them. */
  alreadyHandledToday: number;
  /** Overdue complaints with no accountable officer to derive — nobody has
   *  ever been sent a letter about them, so there is nobody to alert. */
  noAccountableOfficer: number;
  errors: string[];
}

interface RecipientEntry {
  name?: string | null;
  designation?: string | null;
  email?: string | null;
  role?: string;
}

/** Finds every open, overdue complaint, groups the ones with an accountable
 *  officer by that officer's email, and queues one digest job per officer —
 *  at most once per complaint per calendar day. */
export async function sweepOverdueAlerts(): Promise<OverdueAlertSweepResult> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const todayStartIso = `${today}T00:00:00.000Z`;

  const { data: due, error } = await admin
    .from("complaints")
    .select("id")
    .is("deleted_at", null)
    .in("status", COMPLAINT_OPEN_STATUSES as unknown as string[])
    .not("next_follow_up_date", "is", null)
    .lt("next_follow_up_date", today)
    .order("next_follow_up_date")
    .limit(BATCH_LIMIT);

  if (error) return { queued: 0, alreadyHandledToday: 0, noAccountableOfficer: 0, errors: [error.message] };
  const dueIds = ((due as { id: string }[] | null) ?? []).map((c) => c.id);
  if (!dueIds.length) return { queued: 0, alreadyHandledToday: 0, noAccountableOfficer: 0, errors: [] };

  // Already covered by a digest sent today.
  const { data: sentToday } = await admin
    .from("letter_emails")
    .select("complaint_id")
    .in("complaint_id", dueIds)
    .eq("letter_kind", OVERDUE_ALERT_KIND)
    .eq("status", "sent")
    .gte("sent_at", todayStartIso);
  const alreadySent = new Set(((sentToday as { complaint_id: string }[] | null) ?? []).map((r) => r.complaint_id));

  // Already folded into an in-flight (queued/running/retrying) digest job
  // queued today. One job now covers many complaints, so there is no single
  // entity_id to filter by in SQL — the in-flight set is small (at most a
  // handful of officers per tick), so it's cheap to read into memory and
  // filter client-side.
  const { data: inFlightJobs } = await admin
    .from("background_jobs")
    .select("input")
    .eq("type", "email_send")
    .in("status", ["queued", "running", "retrying"])
    .gte("created_at", todayStartIso);
  const inFlightIds = new Set<string>();
  for (const row of (inFlightJobs as { input: unknown }[] | null) ?? []) {
    const inp = row.input as { kind?: string; complaintIds?: string[] } | null;
    if (inp?.kind === "overdue_alert") for (const id of inp.complaintIds ?? []) inFlightIds.add(id);
  }

  const candidateIds = dueIds.filter((id) => !alreadySent.has(id) && !inFlightIds.has(id));
  const alreadyHandledTodayCount = dueIds.length - candidateIds.length;
  if (!candidateIds.length) {
    return { queued: 0, alreadyHandledToday: alreadyHandledTodayCount, noAccountableOfficer: 0, errors: [] };
  }

  const { data: sentRows, error: sentError } = await admin
    .from("letter_emails")
    .select("complaint_id, recipients, sent_at")
    .in("complaint_id", candidateIds)
    .eq("status", "sent")
    .not("recipients", "is", null)
    .order("sent_at", { ascending: false });

  const errors: string[] = [];
  if (sentError) errors.push(sentError.message);

  // Ordered sent_at desc, so the first row seen per complaint is the latest —
  // who currently owns it, not everyone who was ever copied on it.
  const latestRecipientsByComplaint = new Map<string, RecipientEntry[]>();
  for (const row of (sentRows as { complaint_id: string; recipients: RecipientEntry[] | null }[] | null) ?? []) {
    if (!latestRecipientsByComplaint.has(row.complaint_id)) {
      latestRecipientsByComplaint.set(row.complaint_id, row.recipients ?? []);
    }
  }

  const officerGroups = new Map<string, { name: string | null; designation: string | null; complaintIds: string[] }>();
  let noAccountableOfficerCount = 0;

  for (const complaintId of candidateIds) {
    const toEntries = (latestRecipientsByComplaint.get(complaintId) ?? []).filter(
      (r): r is RecipientEntry & { email: string } => Boolean(r.email) && r.role === "to",
    );
    if (!toEntries.length) {
      noAccountableOfficerCount++;
      continue;
    }
    for (const entry of toEntries) {
      const email = entry.email.trim().toLowerCase();
      const group = officerGroups.get(email) ?? { name: entry.name ?? null, designation: entry.designation ?? null, complaintIds: [] };
      if (!group.name && entry.name) group.name = entry.name;
      if (!group.designation && entry.designation) group.designation = entry.designation;
      group.complaintIds.push(complaintId);
      officerGroups.set(email, group);
    }
  }

  let queued = 0;
  for (const [email, group] of officerGroups) {
    try {
      const uniqueIds = [...new Set(group.complaintIds)];
      const { error: insertError } = await admin.from("background_jobs").insert({
        type: "email_send",
        status: "queued",
        title: `Email overdue alert to ${email} (${uniqueIds.length} complaint${uniqueIds.length === 1 ? "" : "s"})`,
        entity_type: "complaint",
        entity_id: null,
        input: {
          officerEmail: email,
          officerName: group.name,
          officerDesignation: group.designation,
          complaintIds: uniqueIds,
          kind: "overdue_alert",
          asOf: today,
        },
        // No human triggered this — see the file-level comment on why that's
        // safe (dispatchJob/sweepBackgroundJobs both tolerate a null owner).
        created_by: null,
      });
      if (insertError) {
        errors.push(`${email}: ${insertError.message}`);
        continue;
      }
      queued += uniqueIds.length;
    } catch (e) {
      errors.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { queued, alreadyHandledToday: alreadyHandledTodayCount, noAccountableOfficer: noAccountableOfficerCount, errors };
}
