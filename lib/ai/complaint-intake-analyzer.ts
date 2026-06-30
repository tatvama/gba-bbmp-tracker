import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";

/**
 * AI intake for "create a complaint from a letter / PDF" (no ZIP, no job code).
 * Reads the OCR text of an uploaded complaint letter / acknowledgement and
 * recognises the Department + Subject + type, the reporter, the requested action,
 * and suggests next actions — to pre-fill a new complaint for the user to confirm.
 */

/** Canonical complaint types (must match the complaints.type CHECK in mig 0004). */
export const COMPLAINT_TYPE_VALUES = [
  "Road", "Drain", "Garbage", "Streetlight", "Footpath", "Park", "Water Logging",
  "Encroachment", "Building Violation", "Public Works", "Bill Payment",
  "Tender Irregularity", "Contractor Issue", "Health Issue", "Revenue Issue",
  "Engineer Non Response", "Ward Office Issue", "Other",
] as const;

export interface ComplaintIntakeExtraction {
  subject: string;
  complaintType: string;
  department: string;
  areaOrWard: string;
  officerNames: string[];
  reporterName: string;
  requestedAction: string;
  summary: string;
  documentType: string; // letter | acknowledgement | reply | other
  referenceNumber: string;
  jobNumber: string;
  importantDates: { label: string; date: string }[];
  suggestedStatus: string;
  suggestedNextActions: string[];
  recommendedEscalation: string;
  confidence: "High" | "Medium" | "Low";
  needsManualReview: boolean;
}

function fallback(): ComplaintIntakeExtraction {
  return {
    subject: "",
    complaintType: "Other",
    department: "",
    areaOrWard: "",
    officerNames: [],
    reporterName: "",
    requestedAction: "",
    summary: "",
    documentType: "letter",
    referenceNumber: "",
    jobNumber: "",
    importantDates: [],
    suggestedStatus: "Draft",
    suggestedNextActions: [],
    recommendedEscalation: "",
    confidence: "Low",
    needsManualReview: true,
  };
}

/** A job code anywhere in the text (ddd-yy-nnnnnn). */
function findJobCode(text: string): string {
  const m = text.match(/\d{3}-\d{2}-\d{6}/);
  return m ? m[0] : "";
}

export async function analyzeComplaintIntake(ocrText: string): Promise<{ ok: boolean; extraction: ComplaintIntakeExtraction; error?: string }> {
  const base = fallback();
  base.jobNumber = findJobCode(ocrText || "");
  const text = (ocrText || "").trim();
  if (!text) return { ok: false, extraction: base, error: "No text to analyse." };

  const system = extractorSystem(
    "Read a citizen's civic complaint letter / acknowledgement (BBMP/GBA, Bengaluru) and recognise its department, subject, type and the action requested.",
  );
  const prompt = `From the document text below, output STRICT JSON of EXACTLY this shape:
{
  "subject": "short subject/title of the complaint",
  "complaintType": one of ${JSON.stringify(COMPLAINT_TYPE_VALUES)},
  "department": "the department/office addressed (free text)",
  "areaOrWard": "area / ward / location mentioned",
  "officerNames": ["any named officer / engineer"],
  "reporterName": "the complainant's name if present",
  "requestedAction": "what the citizen is asking to be done",
  "summary": "2-3 sentence plain summary",
  "documentType": "letter | acknowledgement | reply | other",
  "referenceNumber": "any reference / inward number",
  "jobNumber": "a BBMP works job code ddd-yy-nnnnnn if present, else empty",
  "importantDates": [{ "label": "", "date": "YYYY-MM-DD" }],
  "suggestedStatus": "Draft | Filed | Acknowledged | Reply Received",
  "suggestedNextActions": ["concrete next steps the citizen could take"],
  "recommendedEscalation": "if unresolved, the next forum (e.g. RTI, Lokayukta)",
  "confidence": "High | Medium | Low",
  "needsManualReview": false
}
Use only what is visible; leave fields empty/[] when not present. Do not invent names or numbers.

DOCUMENT:
${text.slice(0, 20_000)}`;

  const r = await extractJson<ComplaintIntakeExtraction>({ system, prompt, fallback: base, maxTokens: 1800 });
  const ex = { ...base, ...r.data };
  if (!COMPLAINT_TYPE_VALUES.includes(ex.complaintType as (typeof COMPLAINT_TYPE_VALUES)[number])) ex.complaintType = "Other";
  if (!ex.jobNumber) ex.jobNumber = base.jobNumber;
  return { ok: r.ok, extraction: ex, error: r.ok ? undefined : r.error };
}
