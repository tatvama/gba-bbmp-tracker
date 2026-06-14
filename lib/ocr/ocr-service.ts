import "server-only";
import { preprocessForOcr, isImageMime } from "./image-preprocess";
import { TesseractOCRProvider } from "./tesseract-provider";

/**
 * Pluggable OCR service. Tesseract is the default (offline). Paid providers are
 * placeholders only. OCR is best-effort: any failure returns a Failed/Skipped
 * status with an error message — it NEVER throws to the caller, so an upload is
 * never broken by OCR.
 */

export interface OCROptions {
  language?: string; // e.g. "eng", "kan", "eng+kan"
}

export interface OCRResult {
  text: string;
  confidence: number | null;
  language: string;
  words?: unknown[];
  pages?: unknown[];
}

export interface OCRProvider {
  name: string;
  extractText(input: Buffer, options?: OCROptions): Promise<OCRResult>;
}

// ── Provider registry ───────────────────────────────────────────────────────

let provider: OCRProvider = new TesseractOCRProvider();

export function getOcrProvider(): OCRProvider {
  return provider;
}
export function setOcrProvider(p: OCRProvider) {
  provider = p;
}

// Placeholders — paid providers are intentionally NOT implemented (spec).
export class GoogleVisionOCRProvider implements OCRProvider {
  name = "google-vision";
  async extractText(): Promise<OCRResult> {
    throw new Error("GoogleVisionOCRProvider not implemented — set up credentials and implement.");
  }
}
export class AzureDocumentIntelligenceProvider implements OCRProvider {
  name = "azure-document-intelligence";
  async extractText(): Promise<OCRResult> {
    throw new Error("AzureDocumentIntelligenceProvider not implemented.");
  }
}
export class AWSTextractProvider implements OCRProvider {
  name = "aws-textract";
  async extractText(): Promise<OCRResult> {
    throw new Error("AWSTextractProvider not implemented.");
  }
}

// ── Text cleanup ────────────────────────────────────────────────────────────

export function cleanOcrText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

// ── Orchestration ───────────────────────────────────────────────────────────

export interface RunOcrInput {
  buffer: Buffer;
  mimeType: string;
  language?: string;
  /** Confidence below this (0-100) → Needs Manual Review. */
  manualReviewThreshold?: number;
}

export interface RunOcrOutput {
  status: "Completed" | "Failed" | "Skipped" | "Needs Manual Review";
  rawText: string;
  cleanText: string;
  confidence: number | null;
  language: string;
  processedImage?: Buffer;
  thumbnail?: Buffer;
  error?: string;
  note?: string;
}

export async function runOcr(input: RunOcrInput): Promise<RunOcrOutput> {
  const language = input.language || "eng";
  const threshold = input.manualReviewThreshold ?? 55;

  // PDFs: v1 does not rasterise. Allow upload + manual summary; structure left
  // for a future PDF-to-image OCR step.
  if (input.mimeType === "application/pdf") {
    return {
      status: "Skipped",
      rawText: "",
      cleanText: "",
      confidence: null,
      language,
      note: "PDF OCR is not enabled in this version. Add a summary manually or convert pages to images.",
    };
  }

  if (!isImageMime(input.mimeType)) {
    return { status: "Skipped", rawText: "", cleanText: "", confidence: null, language, note: "Unsupported type for OCR." };
  }

  let processedImage: Buffer | undefined;
  let thumbnail: Buffer | undefined;
  let ocrInput = input.buffer;
  try {
    const pre = await preprocessForOcr(input.buffer);
    processedImage = pre.ocrImage;
    thumbnail = pre.thumbnail;
    ocrInput = pre.ocrImage;
  } catch (e) {
    console.warn("[ocr] preprocess failed", e);
  }

  const p = getOcrProvider();
  let result: OCRResult | null = null;
  try {
    result = await p.extractText(ocrInput, { language });
  } catch (e) {
    // Retry once with English-only if a combined language pack failed.
    if (language !== "eng") {
      try {
        result = await p.extractText(ocrInput, { language: "eng" });
      } catch (e2) {
        return {
          status: "Failed",
          rawText: "",
          cleanText: "",
          confidence: null,
          language,
          processedImage,
          thumbnail,
          error: e2 instanceof Error ? e2.message : "OCR failed",
        };
      }
    } else {
      return {
        status: "Failed",
        rawText: "",
        cleanText: "",
        confidence: null,
        language,
        processedImage,
        thumbnail,
        error: e instanceof Error ? e.message : "OCR failed",
      };
    }
  }

  const rawText = result?.text ?? "";
  const cleanText = cleanOcrText(rawText);
  const confidence = result?.confidence ?? null;
  const lowConfidence = (confidence !== null && confidence < threshold) || cleanText.length < 12;

  return {
    status: lowConfidence ? "Needs Manual Review" : "Completed",
    rawText,
    cleanText,
    confidence,
    language: result?.language ?? language,
    processedImage,
    thumbnail,
  };
}
