import "server-only";
import puppeteer from "puppeteer";

export interface RenderedPage {
  buffer: Buffer;
  mimeType: string;
  pageNumber: number;
}

export interface PDFRenderer {
  renderPages(pdfBuffer: Buffer): Promise<RenderedPage[]>;
}

class PuppeteerPDFRenderer implements PDFRenderer {
  async renderPages(pdfBuffer: Buffer): Promise<RenderedPage[]> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--font-render-hinting=none",
      ],
    });

    try {
      const page = await browser.newPage();
      const pdfBase64 = pdfBuffer.toString("base64");

      // Load a blank viewport context
      await page.setViewport({ width: 800, height: 1100, deviceScaleFactor: 2 });
      await page.goto("about:blank");
      
      // Inject official PDF.js script into the browser environment
      await page.addScriptTag({
        url: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      });

      // Execute rasterization within the chromium tab context
      const imagesDataUrls = await page.evaluate(async (base64) => {
        // Decode base64 payload to binary array
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Configure PDF.js Global Worker
        // @ts-ignore
        const pdfjsLib = window["pdfjs-dist/build/pdf"];
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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
      }, pdfBase64);

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

export const pdfRenderer: PDFRenderer = new PuppeteerPDFRenderer();
