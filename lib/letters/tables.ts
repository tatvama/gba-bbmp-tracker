/** Pure table-model builders for the letter / DOCX layer. */
import type { LetterFinding, PaymentRow, QuantityRow, SummaryBoxRow } from "./types";
import { QTY_PER_ITEM_QUOTED_CAP_PCT } from "@/lib/constants";

export interface TableModel {
  title: string;
  columns: string[];
  rows: string[][];
  note?: string;
}

const inr = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "" : `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Payment / bill-ledger table. */
export function buildPaymentTable(rows: PaymentRow[]): TableModel {
  return {
    title: "ಪಾವತಿ ವಿವರ (Payment summary)",
    columns: ["Bill", "Date", "Gross", "Deductions", "Net cheque", "Cumulative"],
    rows: rows.map((r) => [r.billNo, r.date, r.gross, r.deductions, r.cheque, r.cumulative]),
  };
}

/** Quantity-variation table; flags any item over the per-item quoted cap (125%). */
export function buildQuantityTable(rows: QuantityRow[]): TableModel {
  const out = rows.map((r) => {
    const pct = r.pctOfTender;
    const flag = pct != null && pct > QTY_PER_ITEM_QUOTED_CAP_PCT ? " ⚠" : "";
    return [r.item, r.description, r.originalQty, r.modifiedQty, r.cumulativeQty, pct == null ? "" : `${pct.toFixed(0)}%${flag}`];
  });
  return {
    title: "ಪ್ರಮಾಣ ವ್ಯತ್ಯಾಸ (Quantity variation)",
    columns: ["Item", "Description", "Tender qty", "Revised qty", "Cumulative", "% of tender"],
    rows: out,
    note: `Items over ${QTY_PER_ITEM_QUOTED_CAP_PCT}% of the tendered quantity require a sanctioned modified Schedule-B.`,
  };
}

/** Cross-document field-mismatch matrix from findings tagged with mismatch text. */
export function buildMismatchMatrix(findings: LetterFinding[]): TableModel {
  const rows = findings
    .filter((f) => f.mismatch && f.mismatch.trim())
    .map((f) => [f.code, f.title, f.observation, f.mismatch ?? ""]);
  return {
    title: "ದಾಖಲೆಗಳ ನಡುವಿನ ವ್ಯತ್ಯಾಸ (Cross-document mismatches)",
    columns: ["Code", "Field", "Observed", "Conflicting / missing record"],
    rows,
  };
}

/** Risk table: per-finding code, grade, score, severity. */
export function buildRiskTable(findings: LetterFinding[]): TableModel {
  const rows = [...findings]
    .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
    .map((f) => [f.code, f.title, f.severity, f.evidenceGrade ?? "", f.riskScore == null ? "" : String(f.riskScore)]);
  return {
    title: "ಅಪಾಯ ಶ್ರೇಣಿ (Risk grading)",
    columns: ["Code", "Finding", "Severity", "Evidence grade", "Risk score"],
    rows,
  };
}

/** "Documents to be produced" list compiled from the findings. */
export function buildDocumentsDemandedTable(findings: LetterFinding[]): TableModel {
  const seen = new Set<string>();
  const rows: string[][] = [];
  let n = 0;
  for (const f of findings) {
    const rec = (f.recordDemand ?? "").trim();
    if (!rec || seen.has(rec.toLowerCase())) continue;
    seen.add(rec.toLowerCase());
    n += 1;
    rows.push([String(n), rec, f.code]);
  }
  return {
    title: "ಹಾಜರುಪಡಿಸಬೇಕಾದ ದಾಖಲೆಗಳು (Documents to be produced)",
    columns: ["#", "Record", "Linked finding"],
    rows,
  };
}

/** The one-glance summary box rendered above the grounds. */
export function buildSummaryBox(findings: LetterFinding[]): SummaryBoxRow[] {
  return findings
    .filter((f) => f.severity !== "Low")
    .map((f, i) => ({
      slNo: i + 1,
      ground: f.title,
      documentReference: f.docRef ?? "",
      whySuspicious: f.suspicionReason ?? f.mismatch ?? f.observation,
      risk: f.evidenceGrade ? `${f.severity} / ${f.evidenceGrade}` : f.severity,
      recordDemanded: f.recordDemand ?? "",
    }));
}

export { inr };
