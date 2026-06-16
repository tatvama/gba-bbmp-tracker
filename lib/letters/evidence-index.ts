/** Evidence index + officer-responsibility table builders (pure). */
import type { LetterFinding, EvidenceIndexRow, OfficerResponsibilityRow } from "./types";

/** A finding is "evidence-grade" only when it carries a document ref + a record to demand. */
export function isCitable(f: LetterFinding): boolean {
  return Boolean((f.docRef && f.docRef.trim()) && (f.recordDemand && f.recordDemand.trim()) && f.evidenceGrade);
}

/** Build the annexure-numbered evidence index from the citable findings. */
export function buildEvidenceIndex(findings: LetterFinding[]): EvidenceIndexRow[] {
  const rows: EvidenceIndexRow[] = [];
  let n = 0;
  for (const f of findings) {
    if (!isCitable(f)) continue;
    n += 1;
    const ref = f.docRef ?? "";
    const pageMatch = /p(?:age|g)?\.?\s*(\d+)/i.exec(ref);
    const itemMatch = /item\s*([\w.-]+)/i.exec(ref);
    rows.push({
      annexure: `A-${n}`,
      document: ref.replace(/\s*[,;].*$/, "").trim() || f.title,
      date: "",
      page: pageMatch?.[1] ?? "",
      item: itemMatch?.[1] ?? "",
      factProved: f.observation,
      findingSupported: `${f.code} — ${f.title}`,
      evidenceGrade: f.evidenceGrade ?? "",
      recordDemanded: f.recordDemand ?? "",
    });
  }
  return rows;
}

function csvCell(v: string): string {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise the evidence index to CSV (BOM-free; caller prepends BOM for Excel if needed). */
export function evidenceIndexToCsv(rows: EvidenceIndexRow[]): string {
  const header = ["Annexure", "Document", "Date", "Page", "Item", "Fact proved", "Finding", "Evidence grade", "Record demanded"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.annexure, r.document, r.date, r.page, r.item, r.factProved, r.findingSupported, r.evidenceGrade, r.recordDemanded].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

const DUTY_BY_PREFIX: Array<{ re: RegExp; officer: string; duty: string }> = [
  { re: /^(ARITH|EXCESS|RATE|QT|HIDDEN)/, officer: "Assistant Engineer (AE) / Assistant Executive Engineer (AEE)", duty: "Measurement recording, rate application and bill check" },
  { re: /^MB/, officer: "Assistant Engineer (AE)", duty: "MB-book recording and test check" },
  { re: /^(DD|IN)/, officer: "Executive Engineer (EE) / Accounts", duty: "Security deposit, insurance and performance-security verification" },
  { re: /^EL/, officer: "Tender Inviting / Accepting Authority", duty: "Contractor eligibility and bid scrutiny" },
  { re: /^CH/, officer: "Executive Engineer (EE)", duty: "Sanction sequence and file movement" },
  { re: /^(ROY|SAL|DISP)/, officer: "Assistant Engineer (AE) / Environmental cell", duty: "Material source, royalty and disposal reconciliation" },
  { re: /^PHOTO/, officer: "Assistant Engineer (AE)", duty: "Geo-tagged photo and portal-log upload" },
];

function dutyFor(code: string): { officer: string; duty: string } {
  for (const d of DUTY_BY_PREFIX) if (d.re.test(code)) return { officer: d.officer, duty: d.duty };
  return { officer: "Executive Engineer (EE)", duty: "Overall supervision and certification" };
}

/** Group findings into an officer-responsibility table (deduped by officer + duty). */
export function buildOfficerResponsibility(findings: LetterFinding[]): OfficerResponsibilityRow[] {
  const byKey = new Map<string, OfficerResponsibilityRow & { codes: string[] }>();
  for (const f of findings) {
    const { officer, duty } = f.responsibleOfficer ? { officer: f.responsibleOfficer, duty: dutyFor(f.code).duty } : dutyFor(f.code);
    const key = `${officer}::${duty}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.codes.push(f.code);
      existing.findingLinked = existing.codes.join(", ");
    } else {
      byKey.set(key, {
        officer,
        dutyArea: duty,
        recordExpected: f.recordDemand ?? "Relevant original records and certifications",
        findingLinked: f.code,
        actionRequested: "Produce the records above and furnish a written explanation within the notice period",
        codes: [f.code],
      });
    }
  }
  return [...byKey.values()].map(({ codes: _codes, ...row }) => row);
}
