import "server-only";
import { extractJson, extractorSystem } from "@/lib/ai/json-extract";
import { generateVision, isAiConfigured } from "@/lib/ai/provider";
import { extractJobCode } from "@/lib/ifms/downloader";

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

  // New detailed fields for multi-complaint letter auto-population
  area?: string;
  ward?: string;
  division?: string;
  reporter?: string;
  jobCodes?: string[];
  references?: string[];
  complaintDate?: string;
  receiver?: string;
  addressedTo?: string;
  emails?: string[];
  contactNumbers?: string[];
  addresses?: string[];
  attachments?: string[];
  language?: string;
  wardId?: string | null;
  wardNo?: number | null;
  wardName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  corporationId?: string | null;
  corporationName?: string | null;
  assignedContactId?: string | null;
  fieldConfidence?: {
    subject?: "High" | "Medium" | "Low";
    complaintType?: "High" | "Medium" | "Low";
    department?: "High" | "Medium" | "Low";
    areaOrWard?: "High" | "Medium" | "Low";
    reporterName?: "High" | "Medium" | "Low";
    requestedAction?: "High" | "Medium" | "Low";
    jobNumber?: "High" | "Medium" | "Low";
    summary?: "High" | "Medium" | "Low";
  };
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
    area: "",
    ward: "",
    division: "",
    reporter: "",
    jobCodes: [],
    references: [],
    complaintDate: "",
    receiver: "",
    addressedTo: "",
    emails: [],
    contactNumbers: [],
    addresses: [],
    attachments: [],
    language: "English",
    wardId: null,
    wardNo: null,
    wardName: null,
    divisionId: null,
    divisionName: null,
    corporationId: null,
    corporationName: null,
    assignedContactId: null,
  };
}

/** A job code anywhere in the text, canonicalised (dash-variant tolerant). */
function findJobCode(text: string): string {
  return extractJobCode(text) ?? "";
}

/** The exact JSON shape both the text and vision extractors ask the model for. */
const INTAKE_JSON_SHAPE = `{
  "subject": "Short subject/title of the complaint (generate one in the original language if missing)",
  "type": "one of ${JSON.stringify(COMPLAINT_TYPE_VALUES)}",
  "department": "the department / office addressed (free text)",
  "area": "area / location mentioned",
  "ward": "ward number or name if mentioned",
  "division": "division name if mentioned",
  "reporter": "complainant name, citizen association, or organization name",
  "requestedAction": "the requested action exactly as written (do not summarize or translate, maintain original language)",
  "jobCodes": ["any BBMP works job codes (ddd-yy-nnnnnn), work orders, file/tender/reference numbers"],
  "references": ["any reference citations or previous letters cited"],
  "complaintDate": "the date printed on the complaint letter (YYYY-MM-DD, or raw text)",
  "receiver": "receiver designation and/or name",
  "addressedTo": "complete recipient address block/details",
  "emails": ["any email addresses found"],
  "contactNumbers": ["any mobile or phone numbers found"],
  "addresses": ["any postal or site addresses mentioned"],
  "attachments": ["any photos, bills, annexures, drawings or supporting sheets mentioned in text"],
  "summary": "a concise 2-3 sentence summary in the original language of the document (do not translate)",
  "language": "English | Kannada | Mixed",
  "confidence": {
    "subject": 0.0 to 1.0,
    "department": 0.0 to 1.0,
    "type": 0.0 to 1.0,
    "area": 0.0 to 1.0,
    "reporter": 0.0 to 1.0,
    "requestedAction": 0.0 to 1.0,
    "jobNumber": 0.0 to 1.0,
    "summary": 0.0 to 1.0,
    "overall": 0.0 to 1.0
  }
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
function finalizeExtraction(base: ComplaintIntakeExtraction, data: any): ComplaintIntakeExtraction {
  const getField = (keys: string[], defaultVal: any = "") => {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null) return data[k];
      const lowerK = k.toLowerCase();
      if (data[lowerK] !== undefined && data[lowerK] !== null) return data[lowerK];
      const upperK = k.charAt(0).toUpperCase() + k.slice(1);
      if (data[upperK] !== undefined && data[upperK] !== null) return data[upperK];
    }
    return defaultVal;
  };

  const subject = getField(["subject"]);
  const complaintType = getField(["type", "complaintType", "complaint_type"], "Other");
  const department = getField(["department"]);
  
  const area = getField(["area"]);
  const ward = getField(["ward"]);
  const division = getField(["division"]);
  const reporter = getField(["reporter", "reporterName", "reporter_name"]);
  const requestedAction = getField(["requestedAction", "requested_action"]);
  const summary = getField(["summary"]);
  const receiver = getField(["receiver"]);
  const addressedTo = getField(["addressedTo", "addressed_to"]);
  const complaintDate = getField(["complaintDate", "complaint_date", "date"]);
  const language = getField(["language"], "English");
  
  const emails = getField(["emails"], []);
  const contactNumbers = getField(["contactNumbers", "contact_numbers", "contactnumber"], []);
  const addresses = getField(["addresses"], []);
  const attachments = getField(["attachments"], []);
  const references = getField(["references"], []);
  const jobCodes = getField(["jobCodes", "job_codes"], []);

  const areaParts = [area, ward, division].filter(Boolean);
  const areaOrWard = getField(["areaOrWard", "area_or_ward"]) || (areaParts.length ? areaParts.join(", ") : "");
  const reporterName = reporter || "";
  
  // Canonicalise whatever the model produced (it may emit an en/em-dash for the
  // separators, or wrap the code in extra text) so the stored/displayed job
  // number is always the clean ASCII "ddd-yy-nnnnnn" — exact matching downstream
  // (and the by-job-number ack route's DB `.eq`) depends on this form.
  let jobNumber = extractJobCode(getField(["jobNumber", "job_number"])) ?? "";
  if (!jobNumber && Array.isArray(jobCodes)) {
    for (const c of jobCodes) {
      const canon = extractJobCode(c);
      if (canon) { jobNumber = canon; break; }
    }
  }
  if (!jobNumber) jobNumber = base.jobNumber;
  
  const documentType = getField(["documentType", "document_type"], "letter");
  const referenceNumber = getField(["referenceNumber", "reference_number"]) || (Array.isArray(references) ? references[0] || "" : "");

  const mapScore = (score: any): "High" | "Medium" | "Low" => {
    const val = Number(score);
    if (isNaN(val) || val === 0) return "Medium";
    if (val >= 0.85) return "High";
    if (val >= 0.6) return "Medium";
    return "Low";
  };

  const fieldConfidence = {
    subject: mapScore(data.confidence?.subject ?? 0.8),
    complaintType: mapScore(data.confidence?.type ?? 0.8),
    department: mapScore(data.confidence?.department ?? 0.8),
    areaOrWard: mapScore(data.confidence?.area ?? 0.8),
    reporterName: mapScore(data.confidence?.reporter ?? 0.8),
    requestedAction: mapScore(data.confidence?.requestedAction ?? 0.8),
    jobNumber: mapScore(data.confidence?.jobNumber ?? 0.8),
    summary: mapScore(data.confidence?.summary ?? 0.8),
  };

  const overallConfidence = mapScore(data.confidence?.overall ?? 0.8);

  const ex: ComplaintIntakeExtraction = {
    ...base,
    ...data,
    subject,
    complaintType,
    department,
    areaOrWard,
    reporterName,
    requestedAction,
    jobNumber,
    summary,
    documentType,
    referenceNumber,
    emails,
    contactNumbers,
    addresses,
    attachments,
    references,
    jobCodes,
    complaintDate,
    receiver,
    addressedTo,
    language,
    division,
    area,
    ward,
    reporter,
    confidence: overallConfidence,
    fieldConfidence,
    needsManualReview: overallConfidence === "Low" || data.needsManualReview === true,
  };

  return sanitize(ex);
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

  const r = await extractJson<ComplaintIntakeExtraction>({ system, prompt, fallback: base, maxTokens: 2500 });
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
  /** Callers looping this over many detected letters/sections in one batch
   *  (ack-runner.ts, the ZIP-import analyze route) pass true — the system
   *  prompt below is identical across every call in that loop. */
  cache?: boolean;
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
    "You read ONE citizen's civic complaint letter / acknowledgement (BBMP / GBA, Bengaluru) from its page IMAGES — the images are authoritative; any OCR text is a NOISY hint (especially for Kannada/handwriting). These are real Bengaluru civic documents in Kannada and/or English — READ THE KANNADA. " +
    "A complaint letter ALWAYS has a matter/subject and asks for something, so you MUST fill `subject` and `summary` even if there is no explicit 'Subject:' line — infer them from the body (you must write them in the original language used in the document, keeping Kannada terms as-is, never translate). Also fill `department`, `area`, `ward`, `reporter`, `requestedAction` and dates whenever they are legible. Only structured identifiers you genuinely cannot see (a reference/job number, an officer's exact name) may be left empty — never invent those. " +
    "Output STRICT JSON only — no markdown fences, no commentary before or after.";
  const hint = (params.ocrText || "").trim()
    ? `OCR hint (noisy — trust the images over this):\n"""\n${params.ocrText.slice(0, 8000)}\n"""`
    : "(No reliable OCR — read the images directly.)";
  const prompt = `${hint}

Output STRICT JSON of EXACTLY this shape:
${INTAKE_JSON_SHAPE}`;

  const res = await generateVision({
    system,
    prompt,
    images,
    temperature: 0,
    maxTokens: 4000,
    cache: params.cache ? { system: true } : undefined,
  });
  if (!res.ok || !res.text) {
    console.warn(`[intake-vision] vision call failed (${res.error ?? "no text"}); falling back to OCR text`);
    return analyzeComplaintIntake(params.ocrText || "");
  }
  if (res.truncated) console.warn("[intake-vision] response hit max_tokens — salvaging the complete fields");

  const data = looseParseJson<ComplaintIntakeExtraction>(res.text);
  if (!data) {
    console.warn("[intake-vision] could not parse JSON from vision response; head:", res.text.slice(0, 200));
    return analyzeComplaintIntake(params.ocrText || "");
  }
  const extraction = finalizeExtraction(base, data);
  console.log(
    `[intake-vision] ok — subject:${extraction.subject ? "yes" : "EMPTY"} dept:${extraction.department ? "yes" : "no"} conf:${extraction.confidence}`,
  );
  return { ok: true, extraction };
}

/** Parse JSON from a model response that may be fenced, wrapped in prose, or
 *  TRUNCATED (hit max_tokens): try as-is, then de-fenced, then first`{`…last`}`,
 *  then a truncation repair that keeps every complete field and closes the object. */
function looseParseJson<T>(text: string): Partial<T> | null {
  const candidates: string[] = [];
  const trimmed = text.trim();
  candidates.push(trimmed);
  candidates.push(trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));
  const repaired = repairTruncatedJson(trimmed);
  if (repaired) candidates.push(repaired);
  for (const c of candidates) {
    try {
      return JSON.parse(c) as Partial<T>;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Salvage a truncated JSON object: keep everything up to the last COMPLETE
 *  top-level field (last depth-1 comma outside a string) and close the braces,
 *  discarding only the incomplete trailing field. Returns null if unsalvageable. */
function repairTruncatedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, lastSafeComma = -1;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 1) lastSafeComma = i;
  }
  if (lastSafeComma < 0) return null;
  return text.slice(start, lastSafeComma) + "}";
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
    area: ex.area ?? "",
    ward: ex.ward ?? "",
    division: ex.division ?? "",
    reporter: ex.reporter ?? "",
    jobCodes: ex.jobCodes ?? [],
    references: ex.references ?? [],
    complaintDate: ex.complaintDate ?? "",
    receiver: ex.receiver ?? "",
    addressedTo: ex.addressedTo ?? "",
    emails: ex.emails ?? [],
    contactNumbers: ex.contactNumbers ?? [],
    addresses: ex.addresses ?? [],
    attachments: ex.attachments ?? [],
    language: ex.language ?? "English",
    wardId: ex.wardId ?? null,
    wardNo: ex.wardNo ?? null,
    wardName: ex.wardName ?? null,
    divisionId: ex.divisionId ?? null,
    divisionName: ex.divisionName ?? null,
    corporationId: ex.corporationId ?? null,
    corporationName: ex.corporationName ?? null,
    assignedContactId: ex.assignedContactId ?? null,
  };
}
