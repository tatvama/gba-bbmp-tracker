import "server-only";
import { createWorker, PSM } from "tesseract.js";
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
      await worker.setParameters({
        // PSM.AUTO (3), NOT AUTO_OSD (1). AUTO_OSD requests orientation/script
        // detection, which needs a separate `osd.traineddata` that createWorker
        // never downloads (it only fetches eng/kan) — so PSM 1 spammed the logs
        // with "osd.traineddata not found / Tesseract couldn't load any
        // languages!" on every page and detected nothing anyway. Scanned office
        // copies are upright, so plain automatic page segmentation is the right
        // mode and needs no extra data file.
        tessedit_pageseg_mode: PSM.AUTO,
      });
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
