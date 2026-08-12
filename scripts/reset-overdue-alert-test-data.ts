/**
 * Clean up test-only "Overdue alert" outbox rows, their communication_logs
 * mirror entries, and the completed background_jobs rows from a prior run of
 * verify-overdue-alert.ts, so it can be re-run fresh against the same
 * complaints (its own daily dedup would otherwise skip them as "already
 * handled today").
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/reset-overdue-alert-test-data.ts <complaintId> [complaintId2 ...]
 */
import { loadEnv } from "./db";
loadEnv();

const complaintIds = process.argv.slice(2);
if (!complaintIds.length) {
  console.error("Usage: reset-overdue-alert-test-data.ts <complaintId> [complaintId2 ...]");
  process.exit(1);
}

async function main() {
  const { createAdminClient } = await import("@/lib/db");
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("letter_emails")
    .select("id, complaint_id")
    .in("complaint_id", complaintIds)
    .eq("letter_kind", "Overdue alert");
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  console.log(`Deleting ${ids.length} test "Overdue alert" outbox row(s): ${ids.join(", ")}`);
  if (ids.length) await admin.from("letter_emails").delete().in("id", ids);

  const { data: logRows } = await admin
    .from("communication_logs")
    .select("id")
    .in("entity_id", complaintIds)
    .eq("comm_type", "Email")
    .ilike("summary", "Overdue alert emailed%");
  const logIds = ((logRows ?? []) as { id: string }[]).map((r) => r.id);
  console.log(`Deleting ${logIds.length} test communication_logs row(s)`);
  if (logIds.length) await admin.from("communication_logs").delete().in("id", logIds);

  const { data: jobRows } = await admin
    .from("background_jobs")
    .select("id, input")
    .eq("type", "email_send")
    .is("created_by", null);
  const targetSet = new Set(complaintIds);
  const jobIds = ((jobRows ?? []) as { id: string; input: unknown }[])
    .filter((j) => {
      const inp = j.input as { kind?: string; complaintIds?: string[] } | null;
      return inp?.kind === "overdue_alert" && (inp.complaintIds ?? []).some((id) => targetSet.has(id));
    })
    .map((j) => j.id);
  console.log(`Deleting ${jobIds.length} test background_jobs row(s): ${jobIds.join(", ")}`);
  if (jobIds.length) await admin.from("background_jobs").delete().in("id", jobIds);

  console.log("✓ cleaned up");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
