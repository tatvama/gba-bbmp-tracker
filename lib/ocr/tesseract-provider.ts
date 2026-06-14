import "server-only";
import { createWorker } from "tesseract.js";
import type { OCRProvider, OCRResult, OCROptions } from "./ocr-service";

/**
 * Default OCR provider — Tesseract.js (offline, no API key). Language data is
 * fetched on first use (eng, kan). Combined "eng+kan" is attempted first; callers
 * (ocr-service) fall back to "eng" if combined data is unavailable.
 */
export class TesseractOCRProvider implements OCRProvider {
  name = "tesseract";

  async extractText(input: Buffer, options?: OCROptions): Promise<OCRResult> {
    const language = options?.language || "eng";
    const worker = await createWorker(language);
    try {
      const { data } = await worker.recognize(input);
      return {
        text: data.text ?? "",
        confidence: typeof data.confidence === "number" ? data.confidence : null,
        language,
      };
    } finally {
      await worker.terminate();
    }
  }
}
