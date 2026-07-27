/**
 * End-to-end verification of the overdue-alert digest feature against REAL
 * complaints in the dev database — the same code path the hourly sweeper and
 * the job runner use in the running app, just triggered on demand instead of
 * waiting for a complaint to actually go overdue.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-overdue-alert.ts <complaintId> [complaintId2 ...]
 *
 * Pass MULTIPLE complaint ids to test the digest-aggregation behaviour: if
 * they share the same accountable officer, the sweep should fold them into
 * ONE job and ONE email listing all of them; if not, each officer gets their
 * own job/email. Either way this script reports exactly which job(s) got
 * created and what each resulting email actually said.
 *
 * Safe by construction: refuses to run unless MAIL_REDIRECT_TO is set (same
 * guard as verify-mail-send.ts), so this can never write to a real official.
 * It temporarily backdates every given complaint's next_follow_up_date so the
 * sweep's own "is this overdue?" query finds them, runs sweepOverdueAlerts()
 * and sweepBackgroundJobs() for real, and restores the original dates in a
 * finally block whether the run succeeds or throws.
 */
import { loadEnv } from "./db";
loadEnv();

const complaintIds = process.argv.slice(2);
if (!complaintIds.length) {
  console.error("Usage: verify-overdue-alert.ts <complaintId> [complaintId2 ...]");
  process.exit(1);
}

async function main() {
  const { getMailConfig } = await import("@/lib/mail/transport");
  const config = getMailConfig();
  if (config.mode === "live") {
    console.error("\n✗ Refusing to run: MAIL_REDIRECT_TO is not set, so this would write to real officials.");
    process.exit(1);
  }
  console.log(`\n── Mail mode: ${config.mode} (redirect target: ${config.redirectTo || "n/a"}) ──`);

  // Registers the email_send handler — required since this standalone script
  // never goes through the request-triggered code path that normally imports
  // it (lib/jobs/handlers/index.ts, pulled in by lib/actions/mail.ts et al.).
  await import("@/lib/jobs/handlers");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { sweepOverdueAlerts } = await import("@/lib/complaints/overdue-alert-scheduler");
  const { sweepBackgroundJobs } = await import("@/lib/jobs/runner");

  const admin = createAdminClient();

  const { data: before } = await admin
    .from("complaints")
    .select("id, complaint_number, internal_case_number, job_number, status, next_follow_up_date")
    .in("id", complaintIds);
  const originals = new Map(
    ((before ?? []) as { id: string; complaint_number: string | null; internal_case_number: string | null; job_number: string | null; status: string; next_follow_up_date: string | null }[]).map(
      (c) => [c.id, c],
    ),
  );
  for (const id of complaintIds) {
    if (!originals.has(id)) {
      console.error(`✗ Complaint ${id} not found.`);
      process.exit(1);
    }
  }
  console.log(`\n── Target complaints (${complaintIds.length}) ──`);
  for (const id of complaintIds) {
    const c = originals.get(id)!;
    console.log(`  ${id}: ${c.complaint_number ?? c.internal_case_number} / job ${c.job_number} — status ${c.status}, next_follow_up_date ${c.next_follow_up_date}`);
  }

  const backdated = "2026-07-20"; // a fixed, comfortably-in-the-past test date

  try {
    console.log(`\n── Backdating next_follow_up_date to ${backdated} for all ${complaintIds.length} complaint(s) ──`);
    const { error: updateErr } = await admin.from("complaints").update({ next_follow_up_date: backdated }).in("id", complaintIds);
    if (updateErr) throw new Error(`Could not backdate complaints: ${updateErr.message}`);

    console.log("\n── Running sweepOverdueAlerts() — the real hourly sweep function ──");
    const sweepResult = await sweepOverdueAlerts();
    console.log(`  queued=${sweepResult.queued} alreadyHandledToday=${sweepResult.alreadyHandledToday} noAccountableOfficer=${sweepResult.noAccountableOfficer} errors=${JSON.stringify(sweepResult.errors)}`);

    if (!sweepResult.queued) {
      console.log("\n(Nothing queued — either no accountable officer was found, or it was already handled today. Nothing further to verify.)");
      return;
    }

    const { data: jobRows } = await admin
      .from("background_jobs")
      .select("id, status, input, created_at")
      .eq("type", "email_send")
      .is("created_by", null)
      .order("created_at", { ascending: false })
      .limit(10);
    const targetSet = new Set(complaintIds);
    const jobs = ((jobRows ?? []) as { id: string; status: string; input: unknown; created_at: string }[]).filter((j) => {
      const inp = j.input as { kind?: string; complaintIds?: string[] } | null;
      return inp?.kind === "overdue_alert" && (inp.complaintIds ?? []).some((id) => targetSet.has(id));
    });
    if (!jobs.length) {
      console.error("✗ Could not find any newly queued job covering these complaints.");
      return;
    }
    console.log(`\n── ${jobs.length} job(s) cover these complaints ──`);
    for (const job of jobs) console.log(`  job ${job.id}: ${JSON.stringify(job.input)}`);
    if (jobs.length === 1) {
      console.log(`  → SINGLE job/email covers all ${complaintIds.length} complaint(s) — they share one accountable officer.`);
    } else {
      console.log(`  → ${jobs.length} SEPARATE jobs/emails — these complaints have different accountable officers.`);
    }

    console.log("\n── Running sweepBackgroundJobs() — the real 2-minute dispatch sweep ──");
    await sweepBackgroundJobs(admin);

    for (const job of jobs) {
      console.log(`\n── Polling job ${job.id} until it finishes ──`);
      let finalStatus = "";
      let result: unknown = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { data: row } = await admin.from("background_jobs").select("status, result, error").eq("id", job.id).maybeSingle();
        const r = row as { status: string; result: unknown; error: string | null } | null;
        if (r && (r.status === "done" || r.status === "failed")) {
          finalStatus = r.status;
          result = r.status === "done" ? r.result : r.error;
          break;
        }
      }
      console.log(`  final status: ${finalStatus || "(still in flight after 15s)"}`);
      console.log(`  result/error: ${JSON.stringify(result, null, 2)}`);

      console.log(`\n  letter_emails rows written by job ${job.id}:`);
      const { data: outboxRows } = await admin
        .from("letter_emails")
        .select("id, complaint_id, letter_kind, status, to_addresses, intended_to, redirected, subject, body, recipients, sent_at")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true });
      for (const row of (outboxRows ?? []) as {
        id: string; complaint_id: string; letter_kind: string; status: string; to_addresses: string[]; intended_to: string[];
        redirected: boolean; subject: string; body: string; recipients: unknown; sent_at: string | null;
      }[]) {
        console.log(`\n    outbox ${row.id} (complaint ${row.complaint_id})`);
        console.log(`      status: ${row.status}  sent_at: ${row.sent_at}`);
        console.log(`      to_addresses (ACTUAL delivery): ${JSON.stringify(row.to_addresses)}`);
        console.log(`      intended_to (real officer): ${JSON.stringify(row.intended_to)}`);
        console.log(`      subject: ${row.subject}`);
        console.log(`      --- body ---\n${row.body}\n      --- end body ---`);

        const leaked = row.to_addresses.filter((a) => a.endsWith(".gov.in"));
        if (leaked.length) {
          console.error(`\n✗ SAFETY INVARIANT VIOLATED — a .gov.in address received actual delivery: ${leaked.join(", ")}`);
          process.exitCode = 1;
        } else {
          console.log("      ✓ no official address in the actual delivery list (redirect held)");
        }
      }
    }
  } finally {
    console.log(`\n── Restoring original next_follow_up_date for all ${complaintIds.length} complaint(s) ──`);
    for (const id of complaintIds) {
      const c = originals.get(id);
      if (!c) continue;
      const { error: restoreErr } = await admin.from("complaints").update({ next_follow_up_date: c.next_follow_up_date }).eq("id", id);
      if (restoreErr) console.error(`✗ COULD NOT RESTORE ${id}: ${restoreErr.message} — fix this manually!`);
      else console.log(`  ✓ restored ${id} to ${c.next_follow_up_date}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\n✗ verification crashed:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
