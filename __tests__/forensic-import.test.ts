import { describe, it, expect } from "vitest";
import {
  classifyRelPath,
  parseRiskColour,
  mapRiskColourToBand,
  computeMissing,
  normalizeDataset,
  groupEntriesByJobCode,
  parseJob,
  assembleForensicJobs,
  fileExt,
  forensicR2SubPath,
  type RawEntry,
} from "@/lib/forensic/parse-skill-output";
import {
  datasetToAuditReport,
  auditRowFromReport,
  datasetToRunningBillRows,
  datasetToTimelineRows,
  datasetToJobCasePatch,
  contractorName,
} from "@/lib/forensic/json-to-audit";
import type { ForensicDataset, ForensicFileRole } from "@/lib/forensic/skill-output";

const B = "batch_W209";
const A = `${B}/_AUDIT_OUTPUT`;
const CODE = "209-26-000004";

describe("classifyRelPath (batch layout)", () => {
  const cases: [string, ForensicFileRole][] = [
    [`${A}/data/${CODE}.json`, "rich_json"],
    [`${A}/work/${CODE}.min.json`, "min_json"],
    [`${A}/work/${CODE}.txt`, "text"],
    [`${A}/work/${CODE}.log`, "log"],
    [`${A}/work/${CODE}_index.json`, "other"],
    [`${A}/work/_batch.log`, "other"],
    [`${A}/work/_work_split.json`, "other"],
    [`${A}/work/ocrsafe_cache/abc123.txt`, "other"],
    [`${A}/letters/Job_${CODE}_complaint_KN.docx`, "letter_docx"],
    [`${A}/letters/Job_${CODE}_complaint_KN.pdf`, "letter_pdf"],
    [`${B}/${CODE}/info.txt`, "info"],
    [`${B}/${CODE}/WO-1-Estimate.pdf`, "portal_pdf"],
    [`${B}/${CODE}/WO-1-NA.jpg`, "other"], // placeholder
    [`${B}/${CODE}/WB-photo1.jpg`, "portal_pdf"], // real photo
  ];
  it.each(cases)("classifies %s", (p, role) => {
    expect(classifyRelPath(p)).toBe(role);
  });
});

describe("forensicR2SubPath", () => {
  it("preserves the shared _AUDIT_OUTPUT grouping (data/letters/work)", () => {
    expect(forensicR2SubPath(`${A}/data/${CODE}.json`, CODE)).toBe(`data/${CODE}.json`);
    expect(forensicR2SubPath(`${A}/letters/Job_${CODE}_complaint_KN.docx`, CODE)).toBe(
      `letters/Job_${CODE}_complaint_KN.docx`,
    );
    expect(forensicR2SubPath(`${A}/work/${CODE}.txt`, CODE)).toBe(`work/${CODE}.txt`);
  });
  it("keeps a job's own source folder flat (everything after the job-code segment)", () => {
    expect(forensicR2SubPath(`${B}/${CODE}/info.txt`, CODE)).toBe("info.txt");
    expect(forensicR2SubPath(`${B}/${CODE}/WO-1-Estimate.pdf`, CODE)).toBe("WO-1-Estimate.pdf");
  });
  it("falls back to the basename when the job-code segment isn't found", () => {
    expect(forensicR2SubPath("some/other/path/file.pdf", CODE)).toBe("file.pdf");
  });
});

describe("fileExt", () => {
  it("lowercases", () => {
    expect(fileExt("X.DOCX")).toBe("docx");
    expect(fileExt("a.min.json")).toBe("json");
  });
});

describe("parseRiskColour", () => {
  it("pulls a colour out of bilingual text", () => {
    expect(parseRiskColour("ಹೆಚ್ಚು ಅಪಾಯ / Red")).toBe("Red");
    expect(parseRiskColour("Orange")).toBe("Orange");
    expect(parseRiskColour("Amber")).toBe("Amber");
    expect(parseRiskColour("ಹಸಿರು / Green")).toBe("Green");
    expect(parseRiskColour("")).toBeNull();
  });
});

describe("mapRiskColourToBand", () => {
  it("maps colour → band", () => {
    expect(mapRiskColourToBand("Red")).toBe("bill_stop");
    expect(mapRiskColourToBand("Purple")).toBe("bill_stop");
    expect(mapRiskColourToBand("Orange")).toBe("serious");
    expect(mapRiskColourToBand("Amber")).toBe("procedural");
    expect(mapRiskColourToBand(null)).toBe("low");
  });
});

const SAMPLE: ForensicDataset = {
  code: CODE,
  work: "Improvements to Roads and drains at IDBI Layout, ward 209 Gottigere",
  division: "Bangalore South Division (South-1)",
  sub_division: "Anjanapura",
  zone: "South",
  wards: "209 Gottigere",
  contractor: "ಒಪ್ಪಂದದ ಪ್ರಕಾರ Sri Uday N (Uday Infrastructures, Proprietorship)",
  overall_risk: "ಹೆಚ್ಚು ಅಪಾಯ / Red",
  treasury_loss_total: "ಪ್ರಮಾಣೀಕರಿಸಲಾಗದು",
  summary: "Job 209-26-000004 — records missing.",
  misleading_summary: ["portal shows a bill id but the supplied set has no bill"],
  grounds: [
    { title: "Missing bill/MB/payment", risk: "Red", observed: "only WO docs", mismatch: "no bill", demand: "produce certified part bill", law: "KTPP s.x" },
    { title: "Tender doubt", risk: "Orange", reason: "single doc", demand: "tender evaluation" },
    { title: "Minor procedural", risk: "Amber", demand: "clarify dates" },
  ],
  payment_rows: [{ item: "Estimate sub total", amount: "₹84,73,139.46", source: "Estimate p9" }],
  chronology: [{ event: "Administrative sanction", date: "26.05.2025" }],
  documents_demanded: ["certified part bill and final bill (incl. bill id 762643)"],
};

function entries(): RawEntry[] {
  return [
    { relPath: `${B}/${CODE}/info.txt`, size: 900, text: "Job Code: " + CODE },
    { relPath: `${B}/${CODE}/WO-1-Estimate.pdf`, size: 7880672 },
    { relPath: `${B}/${CODE}/WO-1-NA.jpg`, size: 2495 },
    { relPath: `${A}/data/${CODE}.json`, size: 39000, text: JSON.stringify(SAMPLE) },
    { relPath: `${A}/work/${CODE}.min.json`, size: 1800, text: JSON.stringify({ code: CODE, work: "skeleton" }) },
    { relPath: `${A}/work/${CODE}.txt`, size: 35000, text: "ocr extracted text" },
    { relPath: `${A}/letters/Job_${CODE}_complaint_KN.docx`, size: 53766, text: "ಪತ್ರದ ಪಠ್ಯ letter body" },
    { relPath: `${A}/letters/Job_${CODE}_complaint_KN.pdf`, size: 448508 },
    { relPath: `${A}/work/${CODE}.log`, size: 1334, text: "log" },
    { relPath: `${A}/work/_batch.log`, size: 2523, text: "batch log" }, // no code → dropped
    { relPath: `${A}/work/ocrsafe_cache/abc.txt`, size: 100, text: "cache" }, // no code → dropped
  ];
}

describe("normalizeDataset", () => {
  it("keeps the real rich shape (grounds, string contractor, raw risk)", () => {
    const d = normalizeDataset(SAMPLE)!;
    expect(d.grounds).toHaveLength(3);
    expect(typeof d.contractor).toBe("string");
    expect(d.overall_risk).toContain("Red");
    expect(d.division).toContain("Bangalore South");
  });
  it("returns null for empty / non-object", () => {
    expect(normalizeDataset({})).toBeNull();
    expect(normalizeDataset(null)).toBeNull();
  });
});

describe("groupEntriesByJobCode + parseJob", () => {
  it("groups across batch + shared _AUDIT_OUTPUT by job code; drops codeless noise", () => {
    const g = groupEntriesByJobCode(entries());
    expect([...g.keys()]).toEqual([CODE]);
    expect(g.get(CODE)!.length).toBe(9); // 11 entries minus _batch.log + ocrsafe (no code)
  });
  it("parses one job: source=json, letter + dataset detected, nothing missing", () => {
    const jobs = assembleForensicJobs(entries());
    expect(jobs).toHaveLength(1);
    const j = jobs[0]!;
    expect(j.jobCode).toBe(CODE);
    expect(j.validCode).toBe(true);
    expect(j.source).toBe("json");
    expect(j.dataset?.work).toContain("IDBI");
    expect(j.letterFileRel).toBe(`${A}/letters/Job_${CODE}_complaint_KN.docx`);
    expect(j.letterPdfRel).toBe(`${A}/letters/Job_${CODE}_complaint_KN.pdf`);
    expect(j.riskColour).toBe("Red");
    expect(j.missing).toEqual([]);
    expect(j.skip).toBe(false);
  });
  it("flags ai-from-letter when no JSON but a letter exists", () => {
    const es: RawEntry[] = [
      { relPath: `${B}/${CODE}/info.txt`, size: 10, text: "x" },
      { relPath: `${A}/letters/Job_${CODE}_complaint_KN.docx`, size: 100, text: "letter only" },
    ];
    const j = parseJob(CODE, es);
    expect(j.source).toBe("ai-from-letter");
    expect(j.dataset).toBeNull();
    expect(j.missing).toContain("Forensic dataset (JSON)");
  });
});

describe("computeMissing", () => {
  it("ignores optional logs/csv", () => {
    const roles = new Set<ForensicFileRole>(["rich_json", "letter_docx", "text", "portal_pdf"]);
    expect(computeMissing(roles)).toEqual([]);
    expect(computeMissing(new Set<ForensicFileRole>(["letter_docx"]))).toContain("Forensic dataset (JSON)");
  });
});

describe("datasetToAuditReport (from grounds)", () => {
  it("maps grounds → ranked findings + risk band from overall_risk", () => {
    const r = datasetToAuditReport(CODE, SAMPLE);
    expect(r.findings).toHaveLength(3);
    expect(r.findings[0]!.recordToDemand).toBeTruthy();
    expect(r.risk.band).toBe("bill_stop"); // Red
    expect(r.counts.redFlags).toBe(3); // none are Low
    expect(r.forensicSkill?.overallRisk).toContain("Red");
    expect(r.forensicSkill?.division).toContain("Bangalore South");
    expect(r.forensicSkill?.documentsDemanded?.length).toBe(1);
  });
  it("auditRowFromReport extracts columns", () => {
    const row = auditRowFromReport(datasetToAuditReport(CODE, SAMPLE));
    expect(row.risk_band).toBe("bill_stop");
    expect(row.finding_count).toBe(3);
  });
});

describe("side-table + job_case mappers", () => {
  it("running-bill rows parse ₹ amounts", () => {
    const rows = datasetToRunningBillRows(CODE, SAMPLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.this_bill).toBe(8473139.46);
    expect(rows[0]!.bill_no).toContain("Estimate");
  });
  it("timeline rows parse dd.mm.yyyy dates", () => {
    const rows = datasetToTimelineRows(CODE, SAMPLE);
    expect(rows[0]!.event_date).toBe("2025-05-26");
  });
  it("job_case patch carries division + string contractor", () => {
    const patch = datasetToJobCasePatch(SAMPLE);
    expect(patch.division).toBe("Bangalore South Division (South-1)");
    expect(patch.contractor).toContain("Sri Uday N");
  });
  it("contractorName handles string and object", () => {
    expect(contractorName("Sri Uday N")).toBe("Sri Uday N");
    expect(contractorName({ name: "ABC" })).toBe("ABC");
    expect(contractorName(undefined)).toBeNull();
  });
});
