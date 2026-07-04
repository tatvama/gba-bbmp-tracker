import "server-only";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRti, getFirstAppeal, getSecondAppeal } from "@/lib/queries";
import { documentRegistry } from "./document-registry";
import { GovernmentDocumentView } from "@/components/rti/government-document-view";
import { PuppeteerPDFProvider } from "./puppeteer-pdf-provider";
import { PDFProvider } from "./pdf-provider";

const defaultProvider: PDFProvider = new PuppeteerPDFProvider();

async function getRenderToStaticMarkup() {
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup;
}

export async function generateRtiPdfService(
  rtiId: string,
  provider: PDFProvider = defaultProvider
): Promise<{ buffer: Buffer; fileName: string }> {
  const rti = await getRti(rtiId);
  if (!rti) {
    throw new Error(`RTI Application not found: ${rtiId}`);
  }

  const docData = documentRegistry.map("rti", rti);
  const element = React.createElement(GovernmentDocumentView, { data: docData });
  
  const renderToStaticMarkup = await getRenderToStaticMarkup();
  const html = renderToStaticMarkup(element);

  const buffer = await provider.generatePdf(html, {
    title: docData.title,
    subject: docData.subject,
    author: docData.senderName,
  });

  const ref = rti.internal_ref || rti.id.substring(0, 8);
  const fileName = `RTI_Application_${ref.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  return { buffer, fileName };
}

export async function generateFirstAppealPdfService(
  appealId: string,
  provider: PDFProvider = defaultProvider
): Promise<{ buffer: Buffer; fileName: string }> {
  const appeal = await getFirstAppeal(appealId);
  if (!appeal) {
    throw new Error(`First Appeal not found: ${appealId}`);
  }

  const rti = await getRti(appeal.rti_id);
  if (!rti) {
    throw new Error(`Original RTI not found for First Appeal: ${appeal.rti_id}`);
  }

  const docData = documentRegistry.map("first_appeal", appeal, { rti });
  const element = React.createElement(GovernmentDocumentView, { data: docData });
  
  const renderToStaticMarkup = await getRenderToStaticMarkup();
  const html = renderToStaticMarkup(element);

  const buffer = await provider.generatePdf(html, {
    title: docData.title,
    subject: docData.subject,
    author: docData.senderName,
  });

  const ref = rti.internal_ref || rti.id.substring(0, 8);
  const fileName = `First_Appeal_${ref.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  return { buffer, fileName };
}

export async function generateSecondAppealPdfService(
  appealId: string,
  provider: PDFProvider = defaultProvider
): Promise<{ buffer: Buffer; fileName: string }> {
  const appeal = await getSecondAppeal(appealId);
  if (!appeal) {
    throw new Error(`Second Appeal not found: ${appealId}`);
  }

  const rti = await getRti(appeal.rti_id);
  if (!rti) {
    throw new Error(`Original RTI not found for Second Appeal: ${appeal.rti_id}`);
  }

  let firstAppeal = null;
  if (appeal.first_appeal_id) {
    firstAppeal = await getFirstAppeal(appeal.first_appeal_id);
  }

  const docData = documentRegistry.map("second_appeal", appeal, { rti, firstAppeal });
  const element = React.createElement(GovernmentDocumentView, { data: docData });
  
  const renderToStaticMarkup = await getRenderToStaticMarkup();
  const html = renderToStaticMarkup(element);

  const buffer = await provider.generatePdf(html, {
    title: docData.title,
    subject: docData.subject,
    author: docData.senderName,
  });

  const ref = rti.internal_ref || rti.id.substring(0, 8);
  const fileName = `Second_Appeal_${ref.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

  return { buffer, fileName };
}

export async function generateDraftPdfService(
  title: string,
  text: string,
  provider: PDFProvider = defaultProvider
): Promise<{ buffer: Buffer; fileName: string }> {
  // Render markdown directly to HTML, matching the preview styling exactly
  const element = React.createElement(
    "div",
    { className: "gov-doc-container", style: { padding: "0" } },
    React.createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm],
        components: {
          h1: ({ children }) => React.createElement("h1", { style: { marginBottom: "0.75rem", fontSize: "14pt", fontWeight: "bold", textTransform: "uppercase", textAlign: "center" } }, children),
          h2: ({ children }) => React.createElement("h2", { style: { marginBottom: "0.5rem", marginTop: "1.25rem", fontSize: "11pt", fontWeight: "bold", textTransform: "uppercase", color: "#1e293b" } }, children),
          h3: ({ children }) => React.createElement("h3", { style: { marginBottom: "0.5rem", marginTop: "1rem", fontSize: "11pt", fontWeight: "bold" } }, children),
          p: ({ children }) => React.createElement("p", { style: { marginBottom: "0.75rem", whiteSpace: "pre-wrap" } }, children),
          strong: ({ children }) => React.createElement("strong", { style: { fontWeight: "bold" } }, children),
          ul: ({ children }) => React.createElement("ul", { style: { marginBottom: "0.75rem", paddingLeft: "1.25rem", listStyleType: "disc" } }, children),
          ol: ({ children }) => React.createElement("ol", { style: { marginBottom: "0.75rem", paddingLeft: "1.25rem", listStyleType: "decimal" } }, children),
          li: ({ children }) => React.createElement("li", { style: { paddingLeft: "0.25rem", marginBottom: "0.25rem" } }, children),
          hr: () => React.createElement("hr", { style: { margin: "1rem 0", borderTop: "1px solid #cbd5e1" } }),
          blockquote: ({ children }) => React.createElement("blockquote", { style: { margin: "0.75rem 0", borderLeft: "3px solid #cbd5e1", paddingLeft: "0.75rem", fontStyle: "italic", color: "#475569" } }, children),
          a: ({ children, href }) => React.createElement("a", { href, style: { textDecoration: "underline", color: "black" } }, children),
          table: ({ children }) => React.createElement("table", { style: { margin: "0.75rem 0", width: "100%", borderCollapse: "collapse", fontSize: "10.5pt" } }, children),
          th: ({ children }) => React.createElement("th", { style: { border: "1px solid #cbd5e1", backgroundColor: "#f1f5f9", padding: "4px 8px", textAlign: "left", fontWeight: "bold" } }, children),
          td: ({ children }) => React.createElement("td", { style: { border: "1px solid #cbd5e1", padding: "4px 8px", verticalAlign: "top" } }, children),
        }
      },
      text
    )
  );

  const renderToStaticMarkup = await getRenderToStaticMarkup();
  const html = renderToStaticMarkup(element);

  const buffer = await provider.generatePdf(html, {
    title: title || "Draft Letter",
  });

  const cleanTitle = title ? title.replace(/[^a-zA-Z0-9]/g, "_") : "Draft_Letter";
  const fileName = `${cleanTitle}.pdf`;

  return { buffer, fileName };
}
