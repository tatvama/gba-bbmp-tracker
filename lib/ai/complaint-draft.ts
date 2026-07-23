import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComplaintDraftPrompt } from "@/lib/ai/complaint-document-analyzer";
import { generateTextStream } from "@/lib/ai/provider";
import { sanitizeDraft } from "@/lib/letters/safe-language";
import { buildCaseIntelligence } from "@/lib/intelligence/engine";
import { serializeForDraft } from "@/lib/intelligence/serialize";
import { reviewDraft, type QualityReport } from "@/lib/intelligence/quality-review";
import { resolveOfficerForWard } from "@/lib/contacts/resolve-officer";
import type { OfficerRecipient } from "@/lib/contacts/officer-recipient";
import type { CaseIntelligence } from "@/lib/intelligence/types";
import {
  buildLegalResolutionContext,
  resolveLegalFramework,
  renderLegalFramework,
  validateDraftCitations,
  type ResolvedLegalFramework,
} from "@/lib/legal";
import {
  LETTER_SIGNATORIES,
  DEFAULT_LEGAL_NOTICE_SENDER,
  HIGH_COURT_CHIEF_JUSTICE_TO,
  type ComplaintDraftKind,
  type DraftLanguage,
  type LegalTone,
  type LegalNoticeSender,
} from "@/lib/constants";

// Redeclared locally (not imported from lib/settings.ts) — that module imports
// next/headers via createClient, which must never load in this request-free
// core (it runs from the background-job runner and the escalation scheduler
// with no request in flight). We read app_settings directly via the admin
// client passed in, same caution as lib/complaints/escalation-scheduler.ts.
const LEGAL_NOTICE_SENDER_KEY = "legal_notice_sender";

/** Request-free read of the saved default PIL sender, merged over defaults. */
async function loadLegalNoticeSender(admin: SupabaseClient): Promise<LegalNoticeSender> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("value")
      .eq("key", LEGAL_NOTICE_SENDER_KEY)
      .maybeSingle();
    return { ...DEFAULT_LEGAL_NOTICE_SENDER, ...((data?.value as Partial<LegalNoticeSender>) ?? {}) };
  } catch {
    return DEFAULT_LEGAL_NOTICE_SENDER;
  }
}

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
  /**
   * Petitioner identity for the FROM / signature block of a `legal_notice`
   * (drafted as a PIL letter to the Hon'ble Chief Justice). When omitted for a
   * legal notice, the saved app_settings default is used — this is how the
   * request-free escalation scheduler supplies it. Ignored for other kinds.
   */
  sender?: LegalNoticeSender;
  /**
   * Override the recipient (TO) block with these verbatim lines (designation +
   * address, no "To," prefix) instead of the resolved ward officer. Used to
   * address a copy to a specific office such as a division's TVCC. Ignored for
   * `legal_notice` (always the Hon'ble Chief Justice).
   */
  recipientOverride?: string[];
  /**
   * Override the FROM / signatory block for a non-PIL letter (name + address +
   * mobile). Used when the sender is asked at draft time (e.g. the TVCC copy)
   * rather than taken from the saved signatory registry.
   */
  senderOverride?: { name: string; address: string; mobile?: string | null };
}

/** Real pipeline stages a caller can surface as a live status (e.g. a
 *  background job persisting each update for the client to poll). */
export type DraftStage = "loading_case" | "building_history" | "building_intelligence" | "drafting" | "safety_check";

export interface DraftProgress {
  stage: DraftStage;
  label: string;
  /** Present only once "drafting" starts streaming — the accumulated text so far. */
  partialText?: string;
}

/** Rich FROM / signature block for the PIL legal notice (petitioner identity). */
function pilFromBlock(s: LegalNoticeSender): string {
  return [
    "FROM (petitioner / signatory — use verbatim at the very top and again in the signature block; omit any line not given):",
    s.name,
    s.ageYears ? `Aged about ${s.ageYears} years` : "",
    s.parentage || "",
    s.organisation || "",
    s.address || "",
    s.mobile ? `Mobile: ${s.mobile}` : "",
    s.email ? `Email: ${s.email}` : "",
    s.role ? `Petitioner capacity (place under the name in the signature block): ${s.role}` : "",
  ].filter(Boolean).join("\n");
}

function complaintContext(
  c: Record<string, any>,
  opts: {
    kind: ComplaintDraftKind;
    signatory?: { name: string; address: string; mobile?: string | null } | null;
    legalSender?: LegalNoticeSender | null;
    today: string;
    wardOfficer?: OfficerRecipient | null;
    recipientOverride?: string[];
  },
): string {
  const isPil = opts.kind === "legal_notice";
  // Real, ready-to-use FROM / TO / Date blocks so the AI never brackets them.
  // A legal notice is drafted as a Public Interest Litigation letter petition,
  // so it uses the RICH petitioner block (age / parentage / organisation /
  // email) and is addressed to the Hon'ble Chief Justice; every other kind
  // keeps the plain signatory block and its department/ward recipient.
  const fromBlock = isPil && opts.legalSender
    ? pilFromBlock(opts.legalSender)
    : opts.signatory
      ? ["FROM (sender / signatory — use verbatim):", opts.signatory.name, opts.signatory.address, opts.signatory.mobile ? `Mobile: ${opts.signatory.mobile}` : ""].filter(Boolean).join("\n")
      : "";
  // Recipient: for a PIL legal notice, always the Hon'ble Chief Justice.
  // Otherwise the explicitly assigned engineer wins; else the officer on record
  // in the BBMP directory for this complaint's ward; else a generic fallback.
  const wo = opts.wardOfficer ?? null;
  const toLines = isPil
    ? HIGH_COURT_CHIEF_JUSTICE_TO
    : opts.recipientOverride && opts.recipientOverride.length
    ? opts.recipientOverride
    : c.assigned_engineer
    ? [
        `The ${c.assigned_engineer.designation || "Executive Engineer"}`,
        c.assigned_engineer.full_name || "",
        c.eng_subdivision?.name ? `${c.eng_subdivision.name} Sub-division` : "",
        "Bruhat Bengaluru Mahanagara Palike (BBMP)",
        c.assigned_engineer.office_address || "",
      ].filter(Boolean)
    : wo
      ? wo.postalBlock
      : [
          "The Executive Engineer",
          c.eng_subdivision?.name ? `${c.eng_subdivision.name} Sub-division` : "",
          "Bruhat Bengaluru Mahanagara Palike (BBMP)",
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
    wo
      ? `Ward-responsible official on record (BBMP directory, matched by ward): ${wo.name}${wo.designation ? `, ${wo.designation}` : ""}${wo.officeName ? ` — ${wo.officeName}` : ""}${wo.phone ? ` — ${wo.phone}` : ""}${wo.email ? ` — ${wo.email}` : ""}`
      : "",
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
  onProgress?: (p: DraftProgress) => void,
): Promise<{ ok: boolean; text?: string; error?: string; lintWarning?: string; truncated?: boolean; qualityReport?: QualityReport; legalCitationWarning?: string }> {
  onProgress?.({ stage: "loading_case", label: "Loading case file…" });
  const { data: c } = await admin
    .from("complaints")
    .select("*, ward:wards!ward_id(new_no,new_name), eng_subdivision:eng_subdivisions!eng_subdivision_id(name), assigned_engineer:contacts!assigned_engineer_id(full_name,designation,office_address,phone,email)")
    .eq("id", input.complaintId)
    .single();
  if (!c) return { ok: false, error: "Complaint not found." };

  // Ward → responsible official from the BBMP contact directory (matched by the
  // complaint's ward). Surfaced in the draft context, and used as the recipient
  // when no engineer is explicitly assigned. Best-effort: null when no mapping.
  const cRow = c as { ward_id?: string | null; ward?: { new_no?: number | null } | null };
  let wardOfficer: OfficerRecipient | null = null;
  if (cRow.ward_id) {
    const r = await resolveOfficerForWard(admin, { wardId: cRow.ward_id });
    wardOfficer = r?.recipient ?? null;
  }
  if (!wardOfficer && cRow.ward?.new_no != null) {
    const r = await resolveOfficerForWard(admin, { wardNo: cRow.ward.new_no });
    wardOfficer = r?.recipient ?? null;
  }

  // Sender identity for the FROM block — the complaint's own letter signatory if
  // set (forensic imports set signatory_key), else the default. Keeps From real.
  const { data: ld } = await admin
    .from("letter_drafts").select("signatory_key").eq("complaint_id", input.complaintId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const sigs = LETTER_SIGNATORIES as Record<string, { name: string; address: string; mobile: string | null }>;
  const signatory = input.senderOverride
    ? { name: input.senderOverride.name, address: input.senderOverride.address, mobile: input.senderOverride.mobile ?? null }
    : (sigs[(ld?.signatory_key as string) || "raghav_gowda"] ?? sigs.raghav_gowda ?? null);

  // A legal notice is drafted as a PIL letter petition to the Hon'ble Chief
  // Justice — its FROM / signature block uses the richer petitioner identity
  // (age, parentage, organisation, capacity, email). Prefer the caller-supplied
  // sender (the editable From-details form); otherwise fall back to the saved
  // app_settings default (this is the path the request-free escalation
  // scheduler takes, since it never supplies a sender).
  const legalSender = input.kind === "legal_notice"
    ? input.sender ?? (await loadLegalNoticeSender(admin))
    : null;

  // Investigate the COMPLETE document set first: build the evidence-linked Case
  // Intelligence artifact and draw the letter from it. Falls back to the thin
  // chronology builder if the engine can't run (AI off / build error) so drafting
  // never blocks.
  const jobNo = (c as { job_number?: string | null }).job_number ?? null;
  onProgress?.({ stage: "building_intelligence", label: "Investigating case documents…" });
  let intel: CaseIntelligence | null = null;
  let evidenceBlock: string;
  try {
    const res = await buildCaseIntelligence(admin, input.complaintId);
    if (res.ok && res.intel) {
      // Serialize BEFORE committing `intel`, so a serialize failure falls back to
      // case history AND leaves intel null (no misleading quality report against
      // an artifact the letter was not built from).
      const block = serializeForDraft(res.intel);
      intel = res.intel;
      evidenceBlock = block;
    } else {
      evidenceBlock = `=== CASE HISTORY (draw the body from this) ===\n${await buildCaseHistory(admin, input.complaintId, jobNo)}`;
    }
  } catch (e) {
    console.warn("[complaint-draft] case intelligence failed, using case history", input.complaintId, e);
    evidenceBlock = `=== CASE HISTORY (draw the body from this) ===\n${await buildCaseHistory(admin, input.complaintId, jobNo)}`;
  }
  const baseContext = `${complaintContext(c as Record<string, any>, { kind: input.kind, signatory, legalSender, today: todayISO(), wardOfficer, recipientOverride: input.recipientOverride })}\n\n${evidenceBlock}`;

  // Additive legal-framework enrichment: resolve the applicable Acts / Rules /
  // Sections for this complaint from the curated, verified knowledge base and append
  // them to the context so the letter can cite the law behind each duty. Skipped for
  // legal_notice (the PIL petition keeps its own hard-coded statute whitelist). Fully
  // inert when nothing applies, and wrapped so a resolver error never blocks drafting.
  let resolvedLegal: ResolvedLegalFramework | null = null;
  let legalBlock = "";
  if (input.kind !== "legal_notice") {
    try {
      const dto = buildLegalResolutionContext(c as Record<string, any>, {
        draftKind: input.kind,
        hasForensicFindings: Boolean(intel?.findings?.length) || Boolean(jobNo),
        caseHistoryText: evidenceBlock,
      });
      resolvedLegal = resolveLegalFramework(dto);
      legalBlock = renderLegalFramework(resolvedLegal);
    } catch (e) {
      console.warn("[complaint-draft] legal framework resolution failed (non-fatal)", input.complaintId, e);
    }
  }
  const context = legalBlock ? `${baseContext}\n\n${legalBlock}` : baseContext;

  const { system, prompt } = buildComplaintDraftPrompt({
    kind: input.kind,
    complaintContext: context,
    tone: input.tone,
    language: input.language,
  });
  // Kannada is far more token-dense than English, and these letters argue a full
  // case history point-by-point (see buildCaseHistory above) — a prior 2500-token
  // default was truncating long Kannada letters mid-sentence with no error, since
  // a truncated-but-nonempty response still passes the ok/text check below. A
  // follow-up 10k cap (mirroring thread-decision-agent.ts) still cut off the
  // longest case-history-heavy Kannada letters; 20k gives real headroom while
  // staying well under this model class's output ceiling.
  // A full-structure, every-detail letter can be long (Kannada is token-dense);
  // give substantive kinds real headroom on the streamed path. Short kinds
  // (WhatsApp) stay small.
  const maxTokens = input.kind === "whatsapp" ? 2_000 : 48_000;
  onProgress?.({ stage: "drafting", label: "Drafting with Claude…" });
  const r = await generateTextStream({ system, prompt, maxTokens, cache: { system: true } }, (partialText) => {
    onProgress?.({ stage: "drafting", label: "Drafting with Claude…", partialText });
  });
  if (!r.ok || !r.text) return { ok: r.ok, text: r.text, error: r.error };

  // Safe-language gate on EVERY kind: rewrite accusatory wording into documented-
  // suspicion phrasing, strip dash punctuation from the prose (official IDs and
  // markdown bullets are preserved — see stripKannadaDashes), then flag anything
  // still prohibited (warn, don't block).
  onProgress?.({ stage: "safety_check", label: "Reviewing safe-language guardrails…" });
  const { text, lint } = sanitizeDraft(r.text);
  // Quality review: how well did the letter cover the investigated intelligence?
  // Guarded so a malformed artifact never discards an already-generated letter.
  let qualityReport: QualityReport | undefined;
  if (intel) {
    try {
      qualityReport = reviewDraft(text, intel);
    } catch (e) {
      console.warn("[complaint-draft] quality review failed", input.complaintId, e);
    }
  }
  // Post-draft citation safety net (WARN, never block — mirrors the lint gate): flag
  // any statute-shaped citation in the letter not backed by the resolved framework or
  // grounded in the provided context / case history. Surfaced for audit; nothing is
  // discarded or altered.
  let legalCitationWarning: string | undefined;
  if (resolvedLegal) {
    try {
      const w = validateDraftCitations(text, resolvedLegal, { contextText: context });
      if (w.length) {
        legalCitationWarning = w.join("; ");
        console.warn("[complaint-draft] unverified legal citation(s)", input.complaintId, legalCitationWarning);
      }
    } catch (e) {
      console.warn("[complaint-draft] citation validation failed (non-fatal)", input.complaintId, e);
    }
  }
  return {
    ok: true,
    text,
    lintWarning: lint.ok ? undefined : lint.errors.map((e) => e.reason).join("; "),
    truncated: r.truncated,
    qualityReport,
    legalCitationWarning,
  };
}
