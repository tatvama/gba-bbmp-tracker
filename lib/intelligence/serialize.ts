import type { CaseIntelligence } from "./types";
import { runComplianceMatrixRanked, complianceSummary } from "@/lib/compliance/engine";

/**
 * Deterministically serialize a CaseIntelligence artifact into a section-labelled
 * text block for the letter-drafting prompt. Emits EVERY finding, reference,
 * financial line, compliance item, chronology entry, officer and synthesis point
 * (length is not a constraint — the drafter must be able to cover every detail).
 * Replaces the thin buildCaseHistory context.
 */
export function serializeForDraft(intel: CaseIntelligence): string {
  const L: string[] = [];
  const { parties, references, project, timeline, financials, findings, correlations, compliance, legalFramework, synthesis, riskAssessment } = intel;

  L.push("=== CASE INTELLIGENCE (draw EVERY section of the letter from this; include every fact) ===");

  // Project + parties
  L.push(`\n[PROJECT] ${project.workDescription ?? "-"}`);
  L.push(`Ward: ${project.ward ?? "-"} | Division: ${project.division ?? "-"} | Sub-division: ${project.subDivision ?? "-"} | Zone: ${project.zone ?? "-"}`);
  const c = parties.contractor;
  if (c.name || c.gstin || c.pan) L.push(`[CONTRACTOR] ${c.name ?? "-"}${c.class ? ` (Class ${c.class})` : ""}${c.gstin ? ` | GSTIN ${c.gstin}` : ""}${c.pan ? ` | PAN ${c.pan}` : ""}${c.agreementNo ? ` | Agreement ${c.agreementNo}` : ""}`);
  if (parties.officers.length) {
    L.push("[OFFICERS / RESPONSIBILITY]");
    for (const o of parties.officers) L.push(`  - ${o.name}${o.designation ? `, ${o.designation}` : ""}${o.office ? `, ${o.office}` : ""} [${o.roles.join("/")}]`);
  }

  // References
  if (references.length) {
    L.push("\n[REFERENCES] (Government Orders / tender / work order / file / bill / agreement numbers)");
    for (const r of references) L.push(`  - ${r.label}: ${r.value}${r.date ? ` (${r.date})` : ""}`);
  }

  // Risk + financials
  L.push(`\n[RISK] band ${riskAssessment.band ?? "-"}, score ${riskAssessment.score ?? "-"}`);
  if (financials.treasuryLossTotal) L.push(`[POSSIBLE EXPOSURE] ${financials.treasuryLossTotal} (possible exposure requiring verification, not a proven loss)`);
  const money = (n: number | null | undefined) => (n == null ? "-" : `₹${n}`);
  if (financials.grossAmount != null || financials.netAmount != null || financials.deduction != null)
    L.push(`[AMOUNTS] gross ${money(financials.grossAmount)} | net ${money(financials.netAmount)} | deduction ${money(financials.deduction)}`);
  if (financials.lossLines.length) {
    L.push("[LOSS / EXPOSURE LINES]");
    for (const l of financials.lossLines) L.push(`  - ${l.label}: ₹${l.exposure} (${l.caveat})`);
  }
  if (financials.runningBills.length) {
    L.push("[RUNNING BILLS]");
    for (const b of financials.runningBills) L.push(`  - Bill ${b.billNo ?? "-"} (${b.billDate ?? "-"}): this ${money(b.thisBill)}, cumulative ${money(b.totalUptoDate)}`);
  }

  // Chronology
  if (timeline.length) {
    L.push("\n[CHRONOLOGY]");
    for (const t of timeline) L.push(`  - ${t.date ?? "?"}: ${t.event}`);
  }

  // Documented suspicions / findings (every one, with code + demand + rule)
  const allFindings = [...findings, ...correlations];
  if (allFindings.length) {
    L.push("\n[DOCUMENTED SUSPICIONS / FINDINGS] (cautious framing; each needs the named record produced)");
    for (const f of allFindings) {
      L.push(`  - ${f.code ? `[${f.code}] ` : ""}(${f.severity}${f.evidenceGrade ? `, grade ${f.evidenceGrade}` : ""}) ${f.statement}`);
      if (f.workedExample) L.push(`      example: ${f.workedExample}`);
      if (f.recordToDemand) L.push(`      record to demand: ${f.recordToDemand}`);
      if (f.ruleRefs.length) L.push(`      rule: ${f.ruleRefs.join("; ")}`);
    }
  }

  // Compliance checklist — the raw per-item list. For a works file the
  // Engineering Compliance Matrix below SUPERSEDES this (it is the canonical
  // rollup), so emit these bullets only for non-works complaints to avoid
  // reporting compliance twice with a possibly-contradictory status.
  if (compliance.length && !intel.meta?.jobNumber) {
    L.push("\n[RULE-WISE / KTPP COMPLIANCE]");
    for (const c2 of compliance) L.push(`  - ${c2.area}: ${c2.requirement} [${c2.status}]${c2.recordToDemand ? ` -> demand: ${c2.recordToDemand}` : ""}`);
  }

  // Insurance coverage (KW-4 Clause 13) — emitted as a real Markdown table so the
  // drafter reproduces it VERBATIM in the letter (the PDF/preview renderer parses
  // GFM tables). The rows, the +20% minimum and the sums are DETERMINISTIC; the
  // drafter must not add, drop, merge or alter any row or figure.
  const ic = intel.insuranceCoverage;
  if (ic && ic.rows.length) {
    L.push(`\n[INSURANCE COVERAGE] (${ic.ruleRef})`);
    L.push("Reproduce the following EXACTLY as a Markdown table in the letter's compliance section (keep every row and every figure; translate only the column headings and cell wording if the letter is not in English):");
    L.push("| Type of Cover | Minimum Cover Required Under KW-4 | Status |");
    L.push("| --- | --- | --- |");
    for (const r of ic.rows) L.push(`| ${r.coverType} | ${r.minimumRequired} | ${r.status} |`);
    if (ic.note) L.push(`Note (include in prose beneath the table): ${ic.note}`);
  }

  // Schedule-B quantity tables (excavation, dismantling/milling) — one GFM table
  // per group with a TOTAL row, reproduced VERBATIM. Figures are transcribed from
  // the documents (require verification); the drafter must not add, drop or alter
  // any row or figure.
  const sb = intel.scheduleBTables;
  if (sb && sb.groups.length) {
    L.push("\n[SCHEDULE-B QUANTITIES] (transcribed from the case documents; require verification against the certified Schedule-B and Measurement Book)");
    L.push("Reproduce EACH of the following EXACTLY as a Markdown table in the Engineering / Financial Analysis section, under its heading, keeping every row, the TOTAL row and every figure (translate only the headings and descriptions if the letter is not in English):");
    for (const g of sb.groups) {
      L.push(`\n${g.title}:`);
      L.push("| Item | Description | Qty | Unit | Rate (Rs.) | Amount at Schedule Rate (Rs.) |");
      L.push("| --- | --- | --- | --- | --- | --- |");
      for (const r of g.rows) L.push(`| ${r.item} | ${r.description} | ${r.qty} | ${r.unit} | ${r.rate} | ${r.amount} |`);
      L.push(`| | ${g.totalLabel} | ${g.totalQty ?? ""} | ${g.totalUnit ?? ""} | | ${g.totalAmount} |`);
    }
    if (sb.note) L.push(`Note (include in prose beneath the tables): ${sb.note}`);
  }

  // Engineering Compliance Matrix — the whole-file per-dimension status
  // (deterministic projection over this artifact via lib/compliance). Emitted as
  // a GFM table the drafter reproduces; only for works files, and only the
  // dimensions that actually apply (not "not_applicable").
  if (intel.meta?.jobNumber) {
    const cellSafe = (s: string) => (s || "").replace(/[–—―]/g, "-").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
    const matrix = runComplianceMatrixRanked(intel).filter((f) => f.status !== "not_applicable");
    if (matrix.length) {
      const sum = complianceSummary(matrix);
      L.push(`\n[ENGINEERING COMPLIANCE MATRIX] (${sum.discrepancy} discrepancy, ${sum.notShown} not-on-record, ${sum.met} met of ${sum.total} dimensions)`);
      L.push("Reproduce as a Markdown table in the Rule-wise / Compliance Analysis section (keep every row; translate only the wording if the letter is not in English):");
      L.push("| # | Compliance Dimension | Status | Severity | Basis / reason | Records to be produced |");
      L.push("| --- | --- | --- | --- | --- | --- |");
      matrix.forEach((f, i) => {
        L.push(`| ${i + 1} | ${cellSafe(f.label)} | ${f.status} | ${f.severity} | ${cellSafe(f.reason)} | ${cellSafe(f.documentsRequired.join("; ")) || "-"} |`);
      });
    }
  }

  // TVCC (Technical Vigilance) cross-check detail beyond the matrix row.
  // Works files only (the matrix row summarises status; this adds the detail).
  const tv = intel.tvcc;
  if (intel.meta?.jobNumber && tv && (tv.reportsFound.length || tv.crossChecks.length)) {
    L.push("\n[TVCC (TECHNICAL VIGILANCE) VERIFICATION] (engineering-compliance check per BBMP administrative instructions / tender conditions, NOT a statute)");
    if (tv.reportsFound.length) L.push(`Reports on record: ${tv.reportsFound.map((r) => [r.reportType, r.reference, r.date].filter(Boolean).join(" ")).join("; ")}`);
    for (const c of tv.crossChecks) L.push(`  - vs ${c.against} [${c.status}]: ${c.detail}`);
    if (tv.note) L.push(`Note: ${tv.note}`);
  }

  // Legal framework
  if (legalFramework.length) {
    L.push("\n[APPLICABLE LEGAL FRAMEWORK]");
    for (const l of legalFramework) L.push(`  - ${l.instrument}${l.provision ? ` (${l.provision})` : ""} — ${l.relevance}`);
  }

  // Documentary evidence index
  if (intel.evidence.length) {
    const docs = new Map<string, string>();
    for (const e of intel.evidence) if (e.sourceDocId) docs.set(e.sourceDocId, e.docType ?? "document");
    if (docs.size) {
      L.push("\n[DOCUMENTARY EVIDENCE]");
      let i = 1;
      for (const [, type] of docs) L.push(`  ${i++}. ${type}`);
    }
  }

  // Synthesis (investigation reasoning)
  L.push("\n[INVESTIGATION SYNTHESIS]");
  L.push(`Situation: ${synthesis.situation}`);
  if (synthesis.outstandingIssues.length) { L.push("Outstanding issues:"); for (const o of synthesis.outstandingIssues) L.push(`  - ${o.issue}${o.status ? ` [${o.status}]` : ""}`); }
  if (synthesis.documentsToDemand.length) { L.push("Documents to demand:"); for (const d of synthesis.documentsToDemand) L.push(`  - ${d}`); }
  if (synthesis.specificRequests.length) { L.push("Specific requests:"); for (const r of synthesis.specificRequests) L.push(`  - ${r}`); }
  if (synthesis.reliefs.length) { L.push("Reliefs sought:"); for (const r of synthesis.reliefs) L.push(`  - ${r}`); }
  if (synthesis.futureCourse.length) { L.push("Future course:"); for (const r of synthesis.futureCourse) L.push(`  - ${r}`); }

  return L.join("\n");
}
