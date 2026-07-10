import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { launchBrowser } from "./chrome-path";

// Same package the primary in-process renderer already uses (below) — loaded
// from disk into the Chromium tab via blob: URLs so the fallback needs zero
// network access at render time. It used to fetch a DIFFERENT, older pdf.js
// build (3.11.174) live from cdnjs.cloudflare.com on every call: a fallback
// whose whole job is to rescue a PDF the primary renderer couldn't handle
// must not itself depend on a third-party CDN being reachable — if egress to
// cdnjs is blocked, slow, or the CDN has a bad day, the document silently
// never gets rendered at all, and nothing downstream (OCR, AI field
// extraction) has any page image to work with.
const PDFJS_BUILD_DIR = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build");

export interface RenderedPage {
  buffer: Buffer;
  mimeType: string;
  pageNumber: number;
}

export interface PDFRenderer {
  renderPages(pdfBuffer: Buffer): Promise<RenderedPage[]>;
}

// ~216 DPI (A4). Matches the effective resolution the previous Chromium renderer
// produced, so eng+kan OCR accuracy is unchanged; don't lower this without
// re-checking OCR quality on real Kannada scans.
const RENDER_SCALE = 3.0;
const JPEG_QUALITY = 90;

type CanvasAndContext = { canvas: Canvas | null; context: unknown };

/**
 * pdfjs constructs whatever class you pass as its `CanvasFactory` option and
 * calls create/reset/destroy on it for any canvas it needs internally. We back
 * it with @napi-rs/canvas (prebuilt binary, zero system dependencies) instead of
 * pdfjs's default NodeCanvasFactory, which `require()`s the `canvas` package and
 * its cairo/pango system libs — the whole point of the pure-Node path is to need
 * nothing beyond npm packages so it runs on the slim container without Chromium.
 */
class NapiCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(cc: CanvasAndContext, width: number, height: number): void {
    if (!cc.canvas) throw new Error("Canvas is not specified");
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: CanvasAndContext): void {
    if (cc.canvas) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    }
    cc.canvas = null;
    cc.context = null;
  }
}

/**
 * Rasterise a PDF to per-page JPEG buffers entirely in-process — no headless
 * browser. This is the PRIMARY renderer: it uses a fraction of Chromium's memory
 * (one page's canvas at a time, freed immediately, no separate browser process),
 * which is what lets the multi-letter OCR import run on a memory-tight
 * VPS/Coolify container where launching Chromium under load was getting the
 * process OOM-killed. Falls back to the Chromium renderer below on any failure.
 */
async function renderPagesPureNode(pdfBuffer: Buffer): Promise<RenderedPage[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    // Fresh copy — pdfjs may detach the underlying ArrayBuffer.
    data: new Uint8Array(pdfBuffer),
    // Use our @napi-rs factory, never pdfjs's node-canvas-based default.
    CanvasFactory: NapiCanvasFactory,
    // Node-safety: no eval (some sandboxes block it), don't probe system fonts
    // (avoids a fontconfig dependency), no OffscreenCanvas in Node.
    isEvalSupported: false,
    useSystemFonts: false,
    isOffscreenCanvasSupported: false,
  });
  const pdf = await loadingTask.promise;
  const factory = new NapiCanvasFactory();
  const out: RenderedPage[] = [];
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const cc = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = cc.context as {
          fillStyle: string;
          fillRect: (x: number, y: number, w: number, h: number) => void;
        };
        // JPEG has no alpha — paint an opaque white ground so any transparent
        // regions render white instead of black.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, cc.canvas!.width, cc.canvas!.height);
        await page.render({
          canvasContext: cc.context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        out.push({ buffer: cc.canvas!.toBuffer("image/jpeg", JPEG_QUALITY), mimeType: "image/jpeg", pageNumber: i });
        factory.destroy(cc); // free this page's pixels before the next one
      } finally {
        page.cleanup();
      }
    }
    return out;
  } finally {
    await pdf.cleanup();
    await pdf.destroy();
  }
}

/**
 * Fallback renderer: rasterise via headless Chromium + pdf.js (the original
 * approach). Only used if the pure-Node path above throws — kept so a PDF the
 * in-process renderer can't handle still degrades to the previously-working
 * behaviour rather than failing the whole import.
 */
class PuppeteerPDFRenderer implements PDFRenderer {
  async renderPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
    const browser = await launchBrowser();

    try {
      const page = await browser.newPage();
      const pdfBase64 = pdfBuffer.toString("base64");

      // Load a blank viewport context
      await page.setViewport({ width: 800, height: 1100, deviceScaleFactor: 2 });
      await page.goto("about:blank");

      // Read the ESM build straight from the installed package — same source
      // the primary renderer imports — and hand both files into the page as
      // strings so it can construct offline blob: URLs. No network fetch.
      const [pdfLibSource, workerSource] = await Promise.all([
        readFile(path.join(PDFJS_BUILD_DIR, "pdf.min.mjs"), "utf8"),
        readFile(path.join(PDFJS_BUILD_DIR, "pdf.worker.min.mjs"), "utf8"),
      ]);

      // Execute rasterization within the chromium tab context
      const imagesDataUrls = await page.evaluate(
        async (base64: string, pdfLibSrc: string, workerSrc: string) => {
          // Decode base64 payload to binary array
          const binaryString = atob(base64);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // The ESM build isn't a global-namespace script — load it as a
          // same-origin blob: URL and import it, entirely offline.
          const libBlobUrl = URL.createObjectURL(new Blob([pdfLibSrc], { type: "text/javascript" }));
          const pdfjsLib = (await import(/* webpackIgnore: true */ libBlobUrl)) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
          const workerBlobUrl = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;

          const loadingTask = pdfjsLib.getDocument({ data: bytes });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;
          const urls: string[] = [];

          // Scale factor: Standard is 72 DPI. 300 DPI corresponds to scale 4.16.
          // Scale 3.0 renders excellent quality (216 DPI) and keeps base64 payload optimized.
          const scale = 3.0;

          for (let i = 1; i <= numPages; i++) {
            const pdfPage = await pdf.getPage(i);
            const viewport = pdfPage.getViewport({ scale });

            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            if (!context) continue;

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF page into canvas context
            await pdfPage.render({
              canvasContext: context,
              viewport: viewport,
            }).promise;

            // Export as JPEG with 90% quality compression
            const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            urls.push(dataUrl);
          }

          return urls;
        },
        pdfBase64,
        pdfLibSource,
        workerSource,
      );

      // Map base64 Data URLs back to Node buffers
      return imagesDataUrls.map((url, idx) => {
        const base64Str = url.split(",")[1] || "";
        return {
          buffer: Buffer.from(base64Str, "base64"),
          mimeType: "image/jpeg",
          pageNumber: idx + 1,
        };
      });
    } finally {
      await browser.close();
    }
  }
}

/**
 * The app's PDF page renderer: pure-Node first (no browser, low memory), with
 * the Chromium renderer as an automatic fallback. Every caller (RTI multi-letter
 * OCR import, forensic-ZIP letter-PDF OCR, complaint intake) goes through this
 * single instance.
 */
class NodeFirstPDFRenderer implements PDFRenderer {
  private readonly fallback = new PuppeteerPDFRenderer();

  async renderPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
    try {
      const pages = await renderPagesPureNode(pdfBuffer);
      if (pages.length > 0) return pages;
      throw new Error("in-process renderer produced no pages");
    } catch (e) {
      console.warn(
        "[pdf-renderer] in-process render failed, falling back to headless Chromium:",
        e instanceof Error ? e.message : e,
      );
      return this.fallback.renderPages(pdfBuffer);
    }
  }
}

export const pdfRenderer: PDFRenderer = new NodeFirstPDFRenderer();
