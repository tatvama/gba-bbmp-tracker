import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { generateVision, isAiConfigured } from "@/lib/ai/provider";

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

/** The exact JSON shape both the text and vision extractors ask the model for. */
const INTAKE_JSON_SHAPE = `{
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
}`;

async function getSharp() {
  const s = await import("sharp");
  return s.default || s;
}

/** Downscale a rendered page to a vision-friendly JPEG (keeps the request small). */
async function downscaleForVision(buf: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
  try {
    const sharp = await getSharp();
    const out = await sharp(buf)
      .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72 })
      .toBuffer();
    return { buffer: out, mimeType: "image/jpeg" };
  } catch {
    return { buffer: buf, mimeType: "image/jpeg" };
  }
}

/** Coerce an AI extraction object into a clean, fully-typed ComplaintIntakeExtraction. */
function finalizeExtraction(base: ComplaintIntakeExtraction, data: Partial<ComplaintIntakeExtraction>): ComplaintIntakeExtraction {
  const ex = sanitize({ ...base, ...data });
  if (!COMPLAINT_TYPE_VALUES.includes(ex.complaintType as (typeof COMPLAINT_TYPE_VALUES)[number])) ex.complaintType = "Other";
  if (!ex.jobNumber) ex.jobNumber = base.jobNumber;
  return ex;
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
${INTAKE_JSON_SHAPE}
Use only what is visible; leave fields empty/[] when not present. Do not invent names or numbers.

DOCUMENT:
${text.slice(0, 20_000)}`;

  const r = await extractJson<ComplaintIntakeExtraction>({ system, prompt, fallback: base, maxTokens: 1800 });
  return { ok: r.ok, extraction: finalizeExtraction(base, r.data), error: r.ok ? undefined : r.error };
}

/**
 * VISION-based per-letter extraction. Detection of letter boundaries is already
 * vision-based, but scanned/handwritten/Kannada letters OCR poorly — so reading
 * the fields from OCR text alone leaves them blank. This reads the fields from the
 * letter's OWN page IMAGES (OCR passed only as a hint), so every detected letter
 * gets its subject/department/type/reporter/etc. filled in automatically. Falls
 * back to the text extractor when AI is off or no images are available, so it
 * never regresses below today's behaviour.
 */
export async function analyzeComplaintIntakeFromImages(params: {
  pageImages: { buffer: Buffer; mimeType: string }[];
  ocrText: string;
}): Promise<{ ok: boolean; extraction: ComplaintIntakeExtraction; error?: string }> {
  const imgs = (params.pageImages || []).slice(0, 6); // a single letter is rarely more
  if (!isAiConfigured() || imgs.length === 0) {
    return analyzeComplaintIntake(params.ocrText || "");
  }

  const base = fallback();
  base.jobNumber = findJobCode(params.ocrText || "");

  const downscaled = await Promise.all(imgs.map((p) => downscaleForVision(p.buffer)));
  const images = downscaled.map((d) => ({ mediaType: d.mimeType, dataBase64: d.buffer.toString("base64") }));

  const system =
    "You read ONE citizen's civic complaint letter / acknowledgement (BBMP / GBA, Bengaluru) from its page IMAGES — the images are authoritative; any OCR text is a NOISY hint (especially for Kannada/handwriting). Extract its fields using ONLY what is visible in THESE pages. Do not invent names or numbers; leave a field empty/[] when it is genuinely absent. Output STRICT JSON only — no markdown, no commentary.";
  const hint = (params.ocrText || "").trim()
    ? `OCR hint (noisy):\n"""\n${params.ocrText.slice(0, 8000)}\n"""`
    : "(No reliable OCR — read the images.)";
  const prompt = `${hint}

Output STRICT JSON of EXACTLY this shape:
${INTAKE_JSON_SHAPE}`;

  const res = await generateVision({ system, prompt, images, temperature: 0, maxTokens: 1800 });
  if (!res.ok || !res.text) {
    // Vision failed → fall back to OCR-text extraction so we never regress.
    return analyzeComplaintIntake(params.ocrText || "");
  }

  const cleaned = res.text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let data: Partial<ComplaintIntakeExtraction>;
  try {
    data = JSON.parse(cleaned) as Partial<ComplaintIntakeExtraction>;
  } catch {
    console.warn("[analyzeComplaintIntakeFromImages] JSON parse failed; falling back to OCR text");
    return analyzeComplaintIntake(params.ocrText || "");
  }
  return { ok: true, extraction: finalizeExtraction(base, data) };
}

/**
 * The extraction prompt (via extractorSystem's shared rule) explicitly permits the
 * model to answer a field with JSON null when "not clearly present". Spread directly
 * into a typed object that feeds controlled <Input value={...}> fields, a null here
 * becomes `value={null}` and React warns/treats the input as uncontrolled. Coerce
 * every string/array field back to the type's own empty value.
 */
function sanitize(ex: ComplaintIntakeExtraction): ComplaintIntakeExtraction {
  return {
    ...ex,
    subject: ex.subject ?? "",
    complaintType: ex.complaintType ?? "",
    department: ex.department ?? "",
    areaOrWard: ex.areaOrWard ?? "",
    officerNames: ex.officerNames ?? [],
    reporterName: ex.reporterName ?? "",
    requestedAction: ex.requestedAction ?? "",
    summary: ex.summary ?? "",
    documentType: ex.documentType ?? "",
    referenceNumber: ex.referenceNumber ?? "",
    jobNumber: ex.jobNumber ?? "",
    importantDates: ex.importantDates ?? [],
    suggestedStatus: ex.suggestedStatus ?? "",
    suggestedNextActions: ex.suggestedNextActions ?? [],
    recommendedEscalation: ex.recommendedEscalation ?? "",
  };
}
