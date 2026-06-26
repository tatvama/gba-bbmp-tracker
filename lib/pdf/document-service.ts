import "server-only";
import * as React from "react";
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
  const docData = documentRegistry.map("draft", { title, text });
  const element = React.createElement(GovernmentDocumentView, { data: docData });
  
  const renderToStaticMarkup = await getRenderToStaticMarkup();
  const html = renderToStaticMarkup(element);

  const buffer = await provider.generatePdf(html, {
    title: docData.title,
  });

  const cleanTitle = title ? title.replace(/[^a-zA-Z0-9]/g, "_") : "Draft_Letter";
  const fileName = `${cleanTitle}.pdf`;

  return { buffer, fileName };
}
