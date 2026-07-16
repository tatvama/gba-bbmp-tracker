import type { NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_WRITE_ROLES } from "@/lib/constants";
import { randomUUID } from "node:crypto";
import { buildMergedPdf } from "@/lib/pdf/merge";
import { pdfRenderer } from "@/lib/pdf/pdf-renderer";
import { runOcr } from "@/lib/ocr/ocr-service";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { detectComplaintLetters } from "@/lib/ai/complaint-letter-detector";
import { generateVision } from "@/lib/ai/provider";
import { analyzeComplaintIntakeFromImages, COMPLAINT_TYPE_VALUES } from "@/lib/ai/complaint-intake-analyzer";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OCR_PAGE_CAP = 24;

interface MasterData {
  wards: any[];
  divisions: any[];
  corporations: any[];
  contacts: any[];
}

// Throttled concurrent execution helper
async function pLimit<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const currentIdx = index++;
      const item = items[currentIdx]!;
      results[currentIdx] = await fn(item, currentIdx);
    }
  }
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }
  await Promise.all(promises);
  return results;
}

function collectFiles(formData: FormData): File[] {
  let raw = formData.getAll("files");
  if (raw.length === 0) raw = formData.getAll("file");
  return raw.filter(
    (x): x is File => typeof x === "object" && x !== null && typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function",
  );
}

function sliceOcr(perPage: string[], startPage: number, endPage: number): string {
  const seg = perPage.slice(startPage - 1, endPage);
  if (seg.length <= 1) return (seg[0] || "").trim();
  return seg.map((t, i) => `--- Page ${startPage + i} ---\n${t}\n`).join("\n").trim();
}

/** Instant, character-based language check. */
function detectLanguage(text: string): "English" | "Kannada" | "Mixed" {
  const hasKannada = /[\u0c80-\u0cff]/.test(text);
  const hasEnglish = /[a-zA-Z]{4,}/.test(text);
  if (hasKannada && hasEnglish) return "Mixed";
  if (hasKannada) return "Kannada";
  return "English";
}

/** Targeted Field Retry logic when mandatory fields are missing. */
async function retryMissingField(
  missingField: string,
  ocrText: string,
  images: { mediaType: string; dataBase64: string }[],
  cache?: boolean,
): Promise<string> {
  try {
    const prompt = `We processed a civic complaint letter but could not extract the "${missingField}".
Please analyze the document images (and OCR hint below) and extract only the "${missingField}".
Maintain the original language of the document. Do not translate. If it is genuinely missing, return empty.
Do NOT output JSON, markdown, or conversation, just the raw text value.

OCR hint:
${ocrText.slice(0, 4000)}`;

    const system = `You are a precise data extractor helper for Bengaluru civic complaints.`;
    const r = await generateVision({
      system,
      prompt,
      images,
      temperature: 0,
      maxTokens: 300,
      cache: cache ? { system: true } : undefined,
    });
    return r.ok && r.text ? r.text.trim() : "";
  } catch {
    return "";
  }
}

/** Cross-Validation rules to infer and enrich missing fields. */
function crossValidate(ex: any, ocrText: string): any {
  // Heuristic Subject Extraction from OCR Text if empty
  if (!ex.subject || ex.subject.trim().length < 3) {
    const lines = ocrText.split("\n");
    for (const line of lines) {
      const match = line.match(/(ವಿಷಯ|विषय|subject)\s*[:：]\s*(.*)/i);
      if (match && match[2] && match[2].trim().length > 3) {
        ex.subject = match[2].trim();
        break;
      }
    }
  }

  // Heuristic Department Extraction from OCR Text if empty
  if (!ex.department || ex.department.trim().length < 3) {
    const lines = ocrText.split("\n");
    for (const line of lines) {
      const match = line.match(/(to|ಗೆ|ರವರಿಗೆ)\s*[:：]?\s*(.*)/i);
      if (match) {
        const idx = lines.indexOf(line);
        const nextLines = lines.slice(idx, idx + 3).map(l => l.trim()).filter(Boolean);
        if (nextLines.length) {
          ex.department = nextLines.join(", ");
          break;
        }
      }
    }
  }

  // Heuristic Job Number recovery from OCR if empty
  if (!ex.jobNumber) {
    const m = ocrText.match(/\d{3}-\d{2}-\d{6}/);
    if (m) ex.jobNumber = m[0];
  }

  // Heuristic Ward/Location recovery from OCR if empty
  if (!ex.areaOrWard || ex.areaOrWard.trim().length < 2) {
    const m = ocrText.match(/(ward|ವಾರ್ಡ್)\s*(\d{1,3})/i);
    if (m && m[2]) {
      ex.areaOrWard = `Ward ${m[2]}`;
      ex.ward = m[2];
    }
  }

  // Infer Department from Receiver
  if (!ex.department && ex.receiver) {
    const r = ex.receiver.toLowerCase();
    if (r.includes("engineer") || r.includes("ee") || r.includes("aee") || r.includes("ae")) {
      ex.department = "BBMP Engineering / Public Works";
    } else if (r.includes("commissioner") || r.includes("health officer")) {
      ex.department = "Administration / Health";
    } else if (r.includes("ward officer")) {
      ex.department = "Ward Office";
    }
  }

  // Infer the responsible BBMP department from subject keywords when the AI left
  // it unclassified. Keep in sync with COMPLAINT_TYPES (lib/constants.ts).
  if (ex.complaintType === "Other" || !ex.complaintType) {
    const contextText = `${ex.subject} ${ex.summary} ${ex.requestedAction}`.toLowerCase();

    if (contextText.match(/lake|tank|kere|rejuvenat|bund|ಕೆರೆ/)) {
      ex.complaintType = "Lakes";
    } else if (contextText.match(/drain|sewage|sewer|storm water|raja ?kaluve|rajakaluve|nala|desilt|water logging|flooding|ಕಾಲುವೆ|ಚರಂಡಿ|ನೆರೆ/)) {
      ex.complaintType = "Storm Water Drain";
    } else if (contextText.match(/streetlight|street light|lamp|bulb|high mast|pole light|electrical|ಬೀದಿ ?ದೀಪ|ದೀಪ/)) {
      ex.complaintType = "Electrical";
    } else if (contextText.match(/park|garden|tree|avenue|sapling|playground|horticultur|ಉದ್ಯಾನ|ಮರ/)) {
      ex.complaintType = "Horticulture";
    } else if (contextText.match(/garbage|trash|waste|dumping|sanitation|swm|mosquito|fogging|health|hospital|ಕಸ|ತ್ಯಾಜ್ಯ|ಆರೋಗ್ಯ/)) {
      ex.complaintType = "Health";
    } else if (contextText.match(/building|plan sanction|bye-?law|unauthoris|unauthoriz|encroach|layout|khata|town planning|ಕಟ್ಟಡ|ಅತಿಕ್ರಮಣ/)) {
      ex.complaintType = "Town Planning";
    } else if (contextText.match(/property tax|khata|advertis|hoarding|trade licen|estate|revenue|ಕಂದಾಯ|ಆಸ್ತಿ ?ತೆರಿಗೆ/)) {
      ex.complaintType = "Revenue";
    } else if (contextText.match(/legal notice|court|litigation|advocate|writ|ಕಾನೂನು|ನ್ಯಾಯಾಲಯ/)) {
      ex.complaintType = "Legal";
    } else if (contextText.match(/software|portal|website|e-?governance|server|application|ತಂತ್ರಾಂಶ/)) {
      ex.complaintType = "IT";
    } else if (contextText.match(/pothole|road|asphalt|asphalting|tarring|whitetopping|white topping|footpath|sidewalk|concreting|ಡಾಂಬರು|ರಸ್ತೆ|ಪಾದಚಾರಿ/)) {
      ex.complaintType = "Road Infrastructure";
    }
  }

  return ex;
}

/** Maps extracted entities against database master records. */
function mapToMasterData(ex: any, master: MasterData): any {
  // 1. Map Ward Name/Number
  let mappedWard = null;
  if (ex.ward) {
    const wardClean = String(ex.ward).toLowerCase().replace(/ward/i, "").trim();
    const wardNo = parseInt(wardClean, 10);
    
    mappedWard = master.wards.find(w => 
      (Number.isFinite(wardNo) && w.new_no === wardNo) ||
      w.new_name.toLowerCase().includes(wardClean)
    );
  }
  
  // 2. Map Division
  let mappedDivision = null;
  if (ex.division) {
    const divClean = String(ex.division).toLowerCase().trim();
    mappedDivision = master.divisions.find(d => 
      d.name.toLowerCase().includes(divClean)
    );
  } else if (mappedWard?.division_id) {
    mappedDivision = master.divisions.find(d => d.id === mappedWard.division_id);
  }

  // 3. Map Corporation
  let mappedCorp = null;
  if (mappedDivision?.corporation_id) {
    mappedCorp = master.corporations.find(c => c.id === mappedDivision.corporation_id);
  }

  // 4. Map Contacts / Assigned Engineer
  let mappedContact = null;
  if (ex.officerNames && ex.officerNames.length) {
    const nameClean = ex.officerNames[0].toLowerCase().trim();
    mappedContact = master.contacts.find(c => 
      c.full_name.toLowerCase().includes(nameClean)
    );
  }

  // Attach mapped fields
  ex.wardId = mappedWard?.id || null;
  ex.wardNo = mappedWard?.new_no || null;
  ex.wardName = mappedWard?.new_name || null;
  ex.divisionId = mappedDivision?.id || null;
  ex.divisionName = mappedDivision?.name || null;
  ex.corporationId = mappedCorp?.id || null;
  ex.corporationName = mappedCorp?.name || null;
  ex.assignedContactId = mappedContact?.id || null;

  return ex;
}

/** Calculates multi-factor field confidence levels. */
function calculateMultiFactorConfidence(ex: any, ocrConf: number | null): any {
  const mapFieldConf = (fieldVal: any, isMasterMatched: boolean, hasExplicitLabel: boolean, patternMatched = false) => {
    let score = 0.5; // baseline
    if (ocrConf && ocrConf > 70) score += 0.2;
    if (isMasterMatched) score += 0.3;
    if (hasExplicitLabel) score += 0.15;
    if (patternMatched) score += 0.25;
    if (!fieldVal || String(fieldVal).trim() === "") score = 0.1;

    if (score >= 0.85) return "High";
    if (score >= 0.55) return "Medium";
    return "Low";
  };

  const hasJobNumber = /^\d{3}-\d{2}-\d{6}$/.test(ex.jobNumber || "");
  const hasSubjectLabel = ex.ocrText?.toLowerCase().includes("subject") || ex.ocrText?.toLowerCase().includes("ವಿಷಯ");
  const hasDeptLabel = ex.ocrText?.toLowerCase().includes("to") || ex.ocrText?.toLowerCase().includes("ಕಚೇರಿ");

  ex.fieldConfidence = {
    subject: mapFieldConf(ex.subject, false, hasSubjectLabel),
    complaintType: mapFieldConf(ex.complaintType, COMPLAINT_TYPE_VALUES.includes(ex.complaintType), false),
    department: mapFieldConf(ex.department, !!ex.departmentId, hasDeptLabel),
    areaOrWard: mapFieldConf(ex.areaOrWard, !!ex.wardId, false),
    reporterName: mapFieldConf(ex.reporterName, false, false),
    requestedAction: mapFieldConf(ex.requestedAction, false, false),
    jobNumber: mapFieldConf(ex.jobNumber, false, false, hasJobNumber),
    summary: mapFieldConf(ex.summary, false, false),
  };

  return ex;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_WRITE_ROLES)) {
    return new Response("Not authorized.", { status: 403 });
  }

  const formData = await req.formData();
  const files = collectFiles(formData);
  if (files.length === 0) {
    return new Response(JSON.stringify({ error: "No files provided." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const parts: { buffer: Buffer; mimeType: string }[] = [];
  for (const f of files) {
    const isImage = f.type.startsWith("image/");
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isImage && !isPdf) {
      return new Response(JSON.stringify({ error: `Unsupported file "${f.name}". Use images or PDF.` }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
    parts.push({ buffer: Buffer.from(await f.arrayBuffer()), mimeType: isPdf ? "application/pdf" : f.type });
  }
  const originalName = files.length === 1 ? files[0]!.name : `combined-upload-${files.length}-files.pdf`;

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        send({ type: "progress", message: "Fetching database master data mapping indexes..." });
        const admin = createAdminClient();
        const [wardsRes, divisionsRes, corpsRes, contactsRes] = await Promise.all([
          admin.from("wards").select("id, new_no, new_name, division_id"),
          admin.from("divisions").select("id, name, corporation_id"),
          admin.from("corporations").select("id, name"),
          admin.from("contacts").select("id, full_name, designation, department"),
        ]);

        const master: MasterData = {
          wards: wardsRes.data || [],
          divisions: divisionsRes.data || [],
          corporations: corpsRes.data || [],
          contacts: contactsRes.data || [],
        };

        send({ type: "progress", message: "Uploading document and preparing for OCR..." });
        const { pdf, pageCount } = await buildMergedPdf(parts);
        const storagePath = await uploadToR2({ key: `complaints/_intake/${randomUUID()}.pdf`, body: pdf, contentType: "application/pdf" });

        send({ type: "progress", message: "Rasterizing PDF pages..." });
        const pages = await pdfRenderer.renderPages(pdf);
        const capped = pages.slice(0, OCR_PAGE_CAP);
        const pageImages = capped.map((p) => ({ buffer: p.buffer, mimeType: p.mimeType }));

        send({ type: "progress", message: `Running OCR on ${capped.length} pages (Kannada + English)...` });
        
        let completedOcr = 0;
        const ocrConfidences: number[] = [];
        const perPage = await pLimit(capped, 4, async (p) => {
          const r = await runOcr({ buffer: p.buffer, mimeType: p.mimeType, language: "eng+kan" });
          completedOcr++;
          ocrConfidences.push(r.confidence || 75);
          send({ type: "progress", message: `OCR Processing: Page ${completedOcr} of ${capped.length} completed` });
          return r.cleanText || r.rawText || "";
        });

        const combined = perPage.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join("\n\n");

        send({ type: "progress", message: "Detecting complaint boundary letters (multiple letters)..." });
        const letters = await detectComplaintLetters({ pageImages, ocrText: combined, pageCount, cache: true });

        send({
          type: "detected",
          count: letters.length,
          originalName,
          pageCount,
          letters,
          storagePath,
        });

        send({ type: "progress", message: `Detected ${letters.length} complaint letters. Running multi-stage extraction...` });

        await pLimit(letters, 3, async (l, idx) => {
          send({ type: "card_progress", index: idx, message: "Analyzing page images..." });
          try {
            const ocrText = sliceOcr(perPage, l.startPage, l.endPage);
            const letterImages = pageImages.slice(l.startPage - 1, l.endPage);

            send({ type: "card_progress", index: idx, message: "Detecting document language..." });
            const lang = detectLanguage(ocrText);

            send({ type: "card_progress", index: idx, message: "Performing NER and structured extraction..." });
            let { extraction } = await analyzeComplaintIntakeFromImages({ pageImages: letterImages, ocrText, cache: true });

            // File logging for diagnostics
            try {
              const fs = require("fs");
              const logData = {
                ocrText,
                extraction,
                l
              };
              fs.writeFileSync(`debug-extraction-${idx}.log`, JSON.stringify(logData, null, 2), "utf-8");
            } catch (logErr) {
              console.error("Log error:", logErr);
            }

            // Apply seed fallbacks from boundary detection
            if (!extraction.subject && l.subject) extraction.subject = l.subject;
            if (!extraction.department && l.department) extraction.department = l.department;
            if (!extraction.referenceNumber && l.referenceNumber) extraction.referenceNumber = l.referenceNumber;
            if (!extraction.language) extraction.language = lang;

            // Targeted retry for missing mandatory fields
            const downscaledForRetry = letterImages.map((d) => ({
              mediaType: d.mimeType,
              dataBase64: d.buffer.toString("base64"),
            }));

            if (!extraction.subject || extraction.subject.length < 3) {
              send({ type: "card_progress", index: idx, message: "Retrying missing Subject extraction..." });
              const subjectRetry = await retryMissingField("Subject", ocrText, downscaledForRetry, true);
              if (subjectRetry) extraction.subject = subjectRetry;
            }

            if (!extraction.department || extraction.department.length < 3) {
              send({ type: "card_progress", index: idx, message: "Retrying missing Department extraction..." });
              const deptRetry = await retryMissingField("Department", ocrText, downscaledForRetry, true);
              if (deptRetry) extraction.department = deptRetry;
            }

            if (!extraction.areaOrWard || extraction.areaOrWard.length < 2) {
              send({ type: "card_progress", index: idx, message: "Retrying missing Location extraction..." });
              const areaRetry = await retryMissingField("Area / Location", ocrText, downscaledForRetry, true);
              if (areaRetry) extraction.areaOrWard = areaRetry;
            }

            send({ type: "card_progress", index: idx, message: "Running cross-validation rules..." });
            extraction = crossValidate(extraction, ocrText);

            send({ type: "card_progress", index: idx, message: "Mapping against database master data..." });
            extraction = mapToMasterData(extraction, master);

            // Compute overall page confidence average
            const avgOcrConf = ocrConfidences.slice(l.startPage - 1, l.endPage).reduce((a, b) => a + b, 0) / (l.endPage - l.startPage + 1 || 1);
            extraction = calculateMultiFactorConfidence(extraction, avgOcrConf);

            send({
              type: "complaint",
              index: idx,
              complaint: { pageStart: l.startPage, pageEnd: l.endPage, ocrText, extraction },
            });
          } catch (err: any) {
            send({
              type: "complaint_error",
              index: idx,
              error: err.message || "Failed to extract letter details.",
            });
          }
        });

        send({ type: "done", success: true });
        controller.close();
      } catch (e: any) {
        send({ type: "error", error: e.message || "An unexpected error occurred during processing." });
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
