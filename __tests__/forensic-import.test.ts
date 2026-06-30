import { describe, it, expect } from "vitest";
import {
  classifyFile,
  computeMissing,
  mapRiskColourToBand,
  normalizeDataset,
  parseJobFolder,
  fileExt,
  type RawFile,
} from "@/lib/forensic/parse-skill-output";
import {
  datasetToAuditReport,
  datasetToRunningBillRows,
  datasetToJobCasePatch,
  datasetToTimelineRows,
  auditRowFromReport,
} from "@/lib/forensic/json-to-audit";
import type { ForensicDataset, ForensicFileRole } from "@/lib/forensic/skill-output";

describe("classifyFile", () => {
  const cases: [string, ForensicFileRole][] = [
    ["047-25-000003.min.json", "min_json"],
    ["047-25-000003.json", "rich_json"],
    ["047-25-000003.txt", "text"],
    ["info.txt", "info"],
    ["047-25-000003.log", "log"],
    ["evidence_index.csv", "evidence_csv"],
    ["Job_047-25-000003_complaint_KN.docx", "letter_docx"],
    ["Job_047-25-000003_complaint_KN.pdf", "letter_pdf"],
    ["WO-1-Estimate.pdf", "portal_pdf"],
    ["WB-Bill-P-01.pdf", "portal_pdf"],
    ["random-note.txt", "text"],
    ["unknown.xyz", "other"],
  ];
  it.each(cases)("classifies %s", (name, role) => {
    expect(classifyFile(name)).toBe(role);
  });
  it("treats a 'complaint' pdf as the letter, not a portal pdf", () => {
    expect(classifyFile("final complaint.pdf")).toBe("letter_pdf");
  });
});

describe("fileExt", () => {
  it("lowercases the extension", () => {
    expect(fileExt("X.DOCX")).toBe("docx");
    expect(fileExt("a.min.json")).toBe("json");
    expect(fileExt("noext")).toBe("");
  });
});

describe("mapRiskColourToBand", () => {
  it("maps colours to bands", () => {
    expect(mapRiskColourToBand("Purple")).toBe("bill_stop");
    expect(mapRiskColourToBand("Red")).toBe("bill_stop");
    expect(mapRiskColourToBand("Orange")).toBe("serious");
    expect(mapRiskColourToBand("Amber")).toBe("procedural");
    expect(mapRiskColourToBand("Green")).toBe("low");
    expect(mapRiskColourToBand(null)).toBe("low");
  });
});

describe("computeMissing", () => {
  it("lists expected-but-absent pieces; ignores optional logs/portal pdfs", () => {
    const roles = new Set<ForensicFileRole>(["text", "min_json", "letter_docx", "evidence_csv"]);
    expect(computeMissing(roles)).toEqual([]);
    const sparse = new Set<ForensicFileRole>(["letter_docx", "log"]);
    expect(computeMissing(sparse)).toContain("Extracted text");
    expect(computeMissing(sparse)).toContain("Forensic dataset (JSON)");
    expect(computeMissing(sparse)).not.toContain("Kannada complaint letter");
  });
});

describe("normalizeDataset", () => {
  it("returns null for non-objects / empty content", () => {
    expect(normalizeDataset(null)).toBeNull();
    expect(normalizeDataset("x")).toBeNull();
    expect(normalizeDataset({})).toBeNull();
    expect(normalizeDataset([])).toBeNull();
  });
  it("keeps recognised forensic content and a valid risk colour", () => {
    const d = normalizeDataset({ work: "Road asphalting", overall_risk: "Red", bogus: 1 });
    expect(d?.work).toBe("Road asphalting");
    expect(d?.overall_risk).toBe("Red");
  });
  it("drops an invalid risk colour", () => {
    const d = normalizeDataset({ summary: "x", overall_risk: "Magenta" });
    expect(d?.overall_risk).toBeUndefined();
  });
});

const SAMPLE: ForensicDataset = {
  code: "047-25-000003",
  org: "BBMP",
  work: "Asphalting of 3rd Main Road",
  division: "Mahadevapura Division",
  zone: "Mahadevapura Zone",
  sub_division: "Hoodi Sub-Division",
  contractor: { name: "ABC Constructions", class: "Class I" },
  payment_rows: [
    { bill: "1", date: "12-04-2025", gross: "10,00,000", deduct: "50,000", net: "9,50,000", cum: "9,50,000" },
    { bill: "2", date: "2025-06-01", gross: "5,00,000", deduct: "25,000", net: "4,75,000", cum: "14,25,000" },
  ],
  chronology: [{ event: "Agreement signed", date: "01-03-2025" }],
  document_presence: { MB_book: "missing", bill: "present", QC_tests: "blank" },
  loss_components: [
    { category: "Excess quantity", amount: 120000, confidence: "high", formula: "Q*R", record: "MB book" },
    { category: "Royalty not recovered", amount: 30000, confidence: "low", record: "Royalty challan" },
  ],
  treasury_loss_total: "Rs 1,50,000",
  misleading_summary: ["Billing shown within agreement when it exceeds it"],
  overall_risk: "Red",
  summary: "Two possible exposures pending records.",
  caveats: "Based on supplied records.",
};

describe("parseJobFolder", () => {
  it("parses a complete job folder (source=json, all present)", () => {
    const files: RawFile[] = [
      { relPath: "047-25-000003.txt", size: 1000, text: "OCR text here" },
      { relPath: "047-25-000003.min.json", size: 800, text: JSON.stringify(SAMPLE) },
      { relPath: "Job_047-25-000003_complaint_KN.docx", size: 9000, text: "ಪತ್ರದ ಪಠ್ಯ" },
      { relPath: "Job_047-25-000003_complaint_KN.pdf", size: 12000 },
      { relPath: "evidence_index.csv", size: 200, text: "a,b" },
      { relPath: "047-25-000003.log", size: 50, text: "log" },
      { relPath: "WO-1-Estimate.pdf", size: 4000 },
    ];
    const r = parseJobFolder("047-25-000003", files);
    expect(r.validCode).toBe(true);
    expect(r.jobCode).toBe("047-25-000003");
    expect(r.source).toBe("json");
    expect(r.dataset?.work).toContain("Asphalting");
    expect(r.missing).toEqual([]);
    expect(r.letterFileRel).toBe("Job_047-25-000003_complaint_KN.docx");
    expect(r.letterPdfRel).toBe("Job_047-25-000003_complaint_KN.pdf");
    expect(r.letterText).toContain("ಪತ್ರ");
    expect(r.riskColour).toBe("Red");
    expect(r.skip).toBe(false);
  });

  it("falls back to ai-from-letter when no JSON but a letter/text exists", () => {
    const files: RawFile[] = [
      { relPath: "099-25-000010.txt", size: 100, text: "some ocr" },
      { relPath: "Job_099-25-000010_complaint_KN.docx", size: 9000, text: "letter body" },
    ];
    const r = parseJobFolder("099-25-000010", files);
    expect(r.source).toBe("ai-from-letter");
    expect(r.dataset).toBeNull();
    expect(r.missing).toContain("Forensic dataset (JSON)");
    expect(r.missing).toContain("Evidence index");
  });

  it("flags an invalid job-code folder and defaults to skip", () => {
    const r = parseJobFolder("not-a-code", [{ relPath: "x.txt", size: 1, text: "" }]);
    expect(r.validCode).toBe(false);
    expect(r.skip).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/not a valid job code/i);
  });

  it("prefers .min.json over .json and warns", () => {
    const files: RawFile[] = [
      { relPath: "047-25-000003.min.json", size: 1, text: JSON.stringify({ work: "MIN" }) },
      { relPath: "047-25-000003.json", size: 1, text: JSON.stringify({ work: "RICH" }) },
    ];
    const r = parseJobFolder("047-25-000003", files);
    expect(r.dataset?.work).toBe("MIN");
    expect(r.warnings.join(" ")).toMatch(/min\.json/i);
  });
});

describe("datasetToAuditReport", () => {
  it("maps loss_components + misleading_summary into ranked findings", () => {
    const report = datasetToAuditReport("047-25-000003", SAMPLE);
    expect(report.jobNumber).toBe("047-25-000003");
    expect(report.findings.length).toBe(3); // 2 loss + 1 misleading
    expect(report.rankedFindings[0]!.riskPoints).toBeGreaterThanOrEqual(
      report.rankedFindings[report.rankedFindings.length - 1]!.riskPoints ?? 0,
    );
    expect(report.risk.band).toBe("bill_stop"); // Red
    expect(report.loss.totalPossibleExposure).toBe(150000); // parsed from "Rs 1,50,000"
    expect(report.documentMatrix.find((m) => m.docType === "bill")?.present).toBe(true);
    expect(report.documentMatrix.find((m) => m.docType === "MB_book")?.present).toBe(false);
    expect(report.forensicSkill?.overallRisk).toBe("Red");
  });

  it("auditRowFromReport extracts the job_audits columns", () => {
    const row = auditRowFromReport(datasetToAuditReport("047-25-000003", SAMPLE));
    expect(row.risk_band).toBe("bill_stop");
    expect(row.total_exposure).toBe(150000);
    expect(row.finding_count).toBe(3);
    expect(row.doc_count).toBe(3);
  });
});

describe("dataset side-table + job_case patch mappers", () => {
  it("builds running-bill rows with parsed amounts + ISO dates", () => {
    const rows = datasetToRunningBillRows("047-25-000003", SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.this_bill).toBe(950000);
    expect(rows[0]!.bill_date).toBe("2025-04-12");
    expect(rows[1]!.total_upto_date).toBe(1425000);
  });
  it("builds timeline rows from chronology + key dates", () => {
    const rows = datasetToTimelineRows("047-25-000003", SAMPLE);
    expect(rows.find((r) => r.event === "Agreement signed")?.event_date).toBe("2025-03-01");
  });
  it("derives a job_cases patch (division + aggregated amounts)", () => {
    const patch = datasetToJobCasePatch(SAMPLE);
    expect(patch.division).toBe("Mahadevapura Division");
    expect(patch.contractor).toBe("ABC Constructions");
    expect(patch.net_amount).toBe(1425000); // last cumulative
    expect(patch.gross_amount).toBe(1500000); // 10L + 5L
  });
});
