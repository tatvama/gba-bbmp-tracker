import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COMPLAINT_SETTINGS, type ComplaintType } from "@/lib/constants";
import { classifyComplaintType } from "@/lib/ai/classify-complaint-type";

/** app_settings key — same value as lib/settings COMPLAINT_SETTINGS_KEY, inlined
 *  here because lib/settings pulls the cookie-scoped supabase client
 *  (next/headers), which must stay OUT of this worker/CLI-reachable module. */
const COMPLAINT_SETTINGS_KEY = "complaint_settings";

/**
 * Framework-free core of "convert a job_case into a Complaint" — extracted
 * from lib/actions/ifms.ts so the background import worker can create
 * complaints OUTSIDE a request scope (no cookies/session available there).
 * The server action wraps this with requireRole + revalidatePath; the worker
 * passes the upload session's owner as userId. Idempotent: a case that
 * already has a complaint returns it unchanged.
 */

export interface ConvertJobCaseResult {
  ok: boolean;
  complaintId?: string;
  caseNumber?: string;
  error?: string;
}

/** Case-number prefix via the ADMIN client — getComplaintSettings() reads
 *  through the cookie-scoped client and silently falls back to defaults when
 *  there's no request; this stays correct in the background worker. */
async function caseNumberPrefix(admin: SupabaseClient): Promise<string> {
  try {
    const { data } = await admin.from("app_settings").select("value").eq("key", COMPLAINT_SETTINGS_KEY).maybeSingle();
    const value = (data?.value ?? {}) as { caseNumberPrefix?: string };
    return value.caseNumberPrefix || DEFAULT_COMPLAINT_SETTINGS.caseNumberPrefix || "DM-CMP";
  } catch {
    return DEFAULT_COMPLAINT_SETTINGS.caseNumberPrefix || "DM-CMP";
  }
}

export async function convertJobCaseCore(
  admin: SupabaseClient,
  jobCaseId: string,
  userId: string,
  opts?: { complaintType?: ComplaintType | null },
): Promise<ConvertJobCaseResult> {
  const { data: jc } = await admin.from("job_cases").select("*").eq("id", jobCaseId).single();
  if (!jc) return { ok: false, error: "Job case not found." };

  // Already converted → return the existing complaint (idempotent).
  if (jc.complaint_id) {
    const { data: existing } = await admin
      .from("complaints")
      .select("internal_case_number")
      .eq("id", jc.complaint_id)
      .maybeSingle();
    return {
      ok: true,
      complaintId: jc.complaint_id as string,
      caseNumber: (existing?.internal_case_number as string) ?? undefined,
    };
  }

  const prefix = await caseNumberPrefix(admin);
  const year = new Date().getFullYear();
  const { data: rpc, error: rpcError } = await admin.rpc("next_complaint_case_number", {
    p_prefix: prefix,
    p_year: year,
  });
  if (rpcError || !rpc) return { ok: false, error: `Could not generate a case number: ${rpcError?.message ?? "unknown"}` };
  const caseNumber = rpc as string;

  const jobNumber = jc.job_number as string;
  const title = (jc.description as string)?.trim() || `BBMP works job ${jobNumber}`;

  // Responsible BBMP department (the complaint's type). The forensic ZIP importer
  // pre-classifies from work + summary + letter text and passes it in; other
  // callers (e.g. the IFMS portal path) get a best-effort classification from the
  // job description here. Falls back to "Other".
  let complaintType: ComplaintType = opts?.complaintType ?? "Other";
  if (!opts?.complaintType) {
    try {
      complaintType = await classifyComplaintType(`${title}\n${(jc.description as string) ?? ""}`);
    } catch {
      complaintType = "Other";
    }
  }

  const { data: comp, error } = await admin
    .from("complaints")
    .insert({
      title: title.slice(0, 300),
      type: complaintType,
      status: "Draft",
      priority: "Medium",
      job_number: jobNumber,
      internal_case_number: caseNumber,
      complaint_mode: "Online portal",
      description: `Imported from the BBMP IFMS portal (job ${jobNumber}). Contractor: ${jc.contractor ?? "—"}. Documents downloaded and audited under this job number; draft the bill-stop / complaint letter from the forensic audit.`,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error || !comp) return { ok: false, error: error?.message ?? "Could not create the complaint." };
  const complaintId = comp.id as string;

  await admin.from("job_cases").update({ complaint_id: complaintId, status: "converted" }).eq("id", jobCaseId);
  await admin.from("complaint_timeline").insert({
    complaint_id: complaintId,
    event_type: "Created",
    title: "Complaint created from BBMP portal job",
    summary: `${caseNumber} — job ${jobNumber}`,
    created_by: userId,
  });

  return { ok: true, complaintId, caseNumber };
}
