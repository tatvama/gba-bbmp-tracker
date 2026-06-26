import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { PDFProvider, PDFGenerateOptions } from "./pdf-provider";
import { GOV_DOC_CONFIG } from "./document-config";

export class PuppeteerPDFProvider implements PDFProvider {
  name = "puppeteer";

  async generatePdf(html: string, options?: PDFGenerateOptions): Promise<Buffer> {
    const cssPath = path.join(process.cwd(), "app", "styles", "government-document.css");
    let cssContent = "";
    try {
      cssContent = fs.readFileSync(cssPath, "utf-8");
    } catch (e) {
      console.warn("Could not load government-document.css from", cssPath, e);
    }

    // Build standard, isolated HTML envelope with injected print CSS
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${options?.title || "Government Document"}</title>
  <style>
    ${cssContent}
  </style>
</head>
<body style="background: white; margin: 0; padding: 0;">
  ${html}
</body>
</html>`;

    // Launch headless Chromium via Puppeteer
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
      
      // Set viewport and content
      await page.setViewport({ width: 800, height: 1130, deviceScaleFactor: 2 });
      await page.setContent(fullHtml, { waitUntil: "domcontentloaded" });

      // Compile PDF with page margins specified in GOV_DOC_CONFIG
      const pdfUint8 = await page.pdf({
        format: "A4",
        landscape: false,
        margin: {
          top: GOV_DOC_CONFIG.margins.top,
          bottom: GOV_DOC_CONFIG.margins.bottom,
          left: GOV_DOC_CONFIG.margins.left,
          right: GOV_DOC_CONFIG.margins.right,
        },
        printBackground: true,
        displayHeaderFooter: false,
      });

      return Buffer.from(pdfUint8);
    } finally {
      await browser.close();
    }
  }
}
