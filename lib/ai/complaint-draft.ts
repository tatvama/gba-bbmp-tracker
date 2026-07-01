import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComplaintDraftPrompt } from "@/lib/ai/complaint-document-analyzer";
import { generateText } from "@/lib/ai/provider";
import { applySafeLanguage, lintLetter } from "@/lib/letters/safe-language";
import { LETTER_SIGNATORIES, type ComplaintDraftKind, type DraftLanguage, type LegalTone } from "@/lib/constants";

/**
 * Core complaint-letter generation, framework-free (takes an admin client) so it
 * can run BOTH from the synchronous server action (generateComplaintDraft) and
 * from a background job runner (after the request has ended, no session).
 */

const todayISO = () => new Date().toISOString().slice(0, 10);

export interface ComplaintDraftInput {
  complaintId: string;
  kind: ComplaintDraftKind;
  tone?: LegalTone;
  language?: DraftLanguage;
}

function complaintContext(
  c: Record<string, any>,
  opts: { signatory?: { name: string; address: string; mobile?: string | null } | null; today: string },
): string {
  // Real, ready-to-use FROM / TO / Date blocks so the AI never brackets them.
  const fromBlock = opts.signatory
    ? ["FROM (sender / signatory — use verbatim):", opts.signatory.name, opts.signatory.address, opts.signatory.mobile ? `Mobile: ${opts.signatory.mobile}` : ""].filter(Boolean).join("\n")
    : "";
  const toLines = [
    `The ${c.assigned_engineer?.designation || "Executive Engineer"}`,
    c.assigned_engineer?.full_name || "",
    c.eng_subdivision?.name ? `${c.eng_subdivision.name} Sub-division` : "",
    "Bruhat Bengaluru Mahanagara Palike (BBMP)",
    c.assigned_engineer?.office_address || "",
  ].filter(Boolean);
  const toBlock = `TO (recipient — use verbatim, omit any line not given):\n${toLines.join("\n")}`;

  return [
    fromBlock,
    toBlock,
    `Date (use as the letter date): ${opts.today}`,
    "",
    `Case: ${c.internal_case_number ?? "—"} | ${c.title}`,
    `Type: ${c.type}${c.complaint_subtype ? ` / ${c.complaint_subtype}` : ""} | Status: ${c.status} | Priority: ${c.priority ?? "—"}`,
    c.complaint_number ? `External complaint no: ${c.complaint_number}` : "",
    c.job_number ? `BBMP IFMS Job No: ${c.job_number}` : "",
    c.contractor ? `Contractor: ${c.contractor}` : "",
    c.date_submitted ? `Complaint given on: ${c.date_submitted}` : "",
    c.location ? `Location: ${c.location}${c.landmark ? `, ${c.landmark}` : ""}` : "",
    c.responsible_department ? `Responsible department: ${c.responsible_department}` : "",
    c.description ? `Description: ${c.description}` : "",
    c.requested_action ? `Requested action: ${c.requested_action}` : "",
    c.latest_reply_summary ? `Latest reply (${c.latest_reply_date ?? "?"}): ${c.latest_reply_summary}` : "No reply received yet.",
    c.latest_action_taken_summary ? `Latest action taken (${c.latest_action_taken_date ?? "?"}): ${c.latest_action_taken_summary}` : "No action taken recorded yet.",
    c.ward?.new_name ? `Ward: ${c.ward.new_no} ${c.ward.new_name}` : "",
  ].filter(Boolean).join("\n");
}

/** Dated case-history block (chronology + replies + actions + escalations +
 *  linked job-audit findings) so every draft argues from the real timeline. */
async function buildCaseHistory(admin: SupabaseClient, complaintId: string, jobNumber: string | null): Promise<string> {
  const [timeline, replies, actions, escalations] = await Promise.all([
    admin.from("complaint_timeline").select("event_date,event_type,title,summary").eq("complaint_id", complaintId).order("event_date", { ascending: true }).limit(40),
    admin.from("complaint_replies").select("reply_date,replied_by_name,reply_summary,issues_remaining,is_satisfactory").eq("complaint_id", complaintId).order("reply_date", { ascending: true }).limit(20),
    admin.from("complaint_action_taken").select("action_taken_date,action_summary,pending_work").eq("complaint_id", complaintId).order("action_taken_date", { ascending: true }).limit(20),
    admin.from("escalation_logs").select("escalated_on,to_level,reason,response_received").eq("entity_id", complaintId).eq("entity_type", "complaint").order("escalated_on", { ascending: true }).limit(20),
  ]);

  const lines: string[] = [];
  const tl = timeline.data ?? [];
  if (tl.length) {
    lines.push("Chronology:");
    for (const e of tl) lines.push(`  - ${e.event_date ?? "?"} [${e.event_type}] ${e.title}${e.summary ? `: ${e.summary}` : ""}`);
  }
  for (const r of replies.data ?? []) {
    lines.push(`Reply (${r.reply_date ?? "?"}${r.replied_by_name ? `, ${r.replied_by_name}` : ""}): ${r.reply_summary ?? ""}${r.issues_remaining ? ` | Unresolved: ${r.issues_remaining}` : ""}${r.is_satisfactory === false ? " | marked NOT satisfactory" : ""}`);
  }
  for (const ac of actions.data ?? []) {
    lines.push(`Action taken (${ac.action_taken_date ?? "?"}): ${ac.action_summary ?? ""}${ac.pending_work ? ` | Still pending: ${ac.pending_work}` : ""}`);
  }
  for (const es of escalations.data ?? []) {
    lines.push(`Escalation (${es.escalated_on ?? "?"}) to ${es.to_level ?? "?"}: ${es.reason ?? ""}${es.response_received ? "" : " | no response recorded"}`);
  }

  if (jobNumber) {
    const { data: audit } = await admin
      .from("job_audits")
      .select("report, risk_band, risk_score, total_exposure")
      .eq("job_number", jobNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const report = (audit?.report ?? null) as { rankedFindings?: { title?: string; detail?: string; recordToDemand?: string }[] } | null;
    const findings = report?.rankedFindings ?? [];
    if (findings.length) {
      lines.push(`\nForensic job audit (job ${jobNumber}, risk ${audit?.risk_band ?? "?"} ${audit?.risk_score ?? ""}${audit?.total_exposure ? `, possible exposure ₹${audit.total_exposure}` : ""}). Top documented suspicions (records to demand):`);
      for (const f of findings.slice(0, 12)) lines.push(`  - ${f.title ?? ""}${f.recordToDemand ? ` → demand: ${f.recordToDemand}` : ""}`);
    }
  }

  return lines.length ? lines.join("\n") : "No case history recorded yet.";
}

export async function runComplaintDraft(
  admin: SupabaseClient,
  input: ComplaintDraftInput,
): Promise<{ ok: boolean; text?: string; error?: string; lintWarning?: string }> {
  const { data: c } = await admin
    .from("complaints")
    .select("*, ward:wards!ward_id(new_no,new_name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name), assigned_engineer:contacts!assigned_engineer_id(full_name,designation,office_address,phone,email)")
    .eq("id", input.complaintId)
    .single();
  if (!c) return { ok: false, error: "Complaint not found." };

  // Sender identity for the FROM block — the complaint's own letter signatory if
  // set (forensic imports set signatory_key), else the default. Keeps From real.
  const { data: ld } = await admin
    .from("letter_drafts").select("signatory_key").eq("complaint_id", input.complaintId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const sigs = LETTER_SIGNATORIES as Record<string, { name: string; address: string; mobile: string | null }>;
  const signatory = sigs[(ld?.signatory_key as string) || "raghav_gowda"] ?? sigs.raghav_gowda ?? null;

  // Ground EVERY letter/reply in the real chronology + forensic findings.
  const history = await buildCaseHistory(admin, input.complaintId, (c as { job_number?: string | null }).job_number ?? null);
  const context = `${complaintContext(c as Record<string, any>, { signatory, today: todayISO() })}\n\n=== CASE HISTORY (draw the body from this) ===\n${history}`;

  const { system, prompt } = buildComplaintDraftPrompt({
    kind: input.kind,
    complaintContext: context,
    tone: input.tone,
    language: input.language,
  });
  const r = await generateText({ system, prompt });
  if (!r.ok || !r.text) return { ok: r.ok, text: r.text, error: r.error };

  // Safe-language gate on EVERY kind: rewrite accusatory wording into documented-
  // suspicion phrasing, then flag anything still prohibited (warn, don't block).
  // We do NOT strip dashes here — that would wreck the Markdown the preview renders.
  const text = applySafeLanguage(r.text);
  const lint = lintLetter(text);
  return { ok: true, text, lintWarning: lint.ok ? undefined : lint.errors.map((e) => e.reason).join("; ") };
}
