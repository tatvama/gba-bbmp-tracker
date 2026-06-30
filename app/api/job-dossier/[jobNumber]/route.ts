import { NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_VERIFY_ROLES } from "@/lib/constants";
import { getJobAudit, getJobDossier, getJobLinkedRtis } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const inr = (n: number | null | undefined) =>
  typeof n === "number" && n > 0 ? `Rs ${Math.round(n).toLocaleString("en-IN")}` : "-";

function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level, spacing: { before: 200, after: 80 } });
}
function p(text: string, opts?: { bold?: boolean; italics?: boolean }) {
  return new Paragraph({ children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italics })], spacing: { after: 60 } });
}

/** Consolidated filing packet (DOCX) for one job code: complaint + RTI + findings + evidence. */
export async function GET(_req: Request, { params }: { params: Promise<{ jobNumber: string }> }) {
  const user = await getSessionUser();
  if (!hasRole(user, COMPLAINT_VERIFY_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const { jobNumber: rawParam } = await params;
  const jobNumber = decodeURIComponent(rawParam);

  const [audit, complaints, rtis] = await Promise.all([
    getJobAudit(jobNumber),
    getJobDossier(jobNumber),
    getJobLinkedRtis(jobNumber),
  ]);
  const report = audit?.report ?? null;
  const contractor = complaints.find((c) => c.contractor)?.contractor ?? "-";
  const division = complaints.find((c) => c.division)?.division ?? "-";

  const children: Paragraph[] = [];
  children.push(new Paragraph({ text: `Evidence Dossier — Job ${jobNumber}`, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }));
  children.push(p("Consolidated forensic packet for escalation (RTI / Lokayukta / PIL). All findings are documented suspicions requiring records and explanation; exposure figures are possible amounts requiring verification.", { italics: true }));

  children.push(h("Job", HeadingLevel.HEADING_2));
  children.push(p(`Job / work-order no.: ${jobNumber}`));
  children.push(p(`Contractor: ${contractor}`));
  children.push(p(`Division: ${division}`));
  children.push(p(`Linked cases: ${complaints.length} complaint(s), ${rtis.length} RTI`));
  if (report) {
    children.push(p(`Overall risk: ${report.risk.band} (${report.risk.score}/100)`));
    children.push(p(`Possible exposure: ${inr(report.loss.totalPossibleExposure)} · Red flags: ${report.counts.redFlags}`));
  }

  if (report && report.rankedFindings.length) {
    children.push(h("Forensic findings (suspicions for review)", HeadingLevel.HEADING_2));
    report.rankedFindings.forEach((f, i) => {
      children.push(p(`${i + 1}. [${f.severity}] ${f.title}`, { bold: true }));
      if (f.safeText || f.detail) children.push(p(f.safeText ?? f.detail));
      if (f.recordToDemand) children.push(p(`Record to demand: ${f.recordToDemand}`, { italics: true }));
    });
  }

  if (rtis.length) {
    children.push(h("Linked RTI applications", HeadingLevel.HEADING_2));
    rtis.forEach((r) => children.push(p(`${r.internalRef ?? r.id.slice(0, 8)} — ${r.subject} [${r.status}]`)));
  }

  children.push(h("Evidence index", HeadingLevel.HEADING_2));
  let n = 1;
  for (const c of complaints) {
    children.push(p(`${c.caseNumber ?? c.title}${c.location ? ` — ${c.location}` : ""}`, { bold: true }));
    for (const d of c.documents) {
      const flags = [d.isDuplicate ? "DUPLICATE" : "", d.geoFlag === "far" ? "GPS off-site" : "", d.visionVerdict && d.visionVerdict !== "ok" ? `vision:${d.visionVerdict}` : ""].filter(Boolean).join(", ");
      children.push(p(`${n++}. ${d.title || "Document"} (${d.documentType ?? "-"})${flags ? ` [${flags}]` : ""}`));
      children.push(p(`    SHA-256: ${d.sha256 ?? "(not computed)"}`, { italics: true }));
    }
    if (c.documents.length === 0) children.push(p("    No documents."));
  }

  children.push(p(`Generated ${new Date().toISOString().slice(0, 10)}. Verify against originals before filing.`, { italics: true }));

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  const fileBase = `Dossier_${jobNumber.replace(/[^\w-]+/g, "_")}`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileBase}.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
