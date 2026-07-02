import { describe, it, expect } from "vitest";
import { parseJob, classifyRelPath, forensicR2SubPath, type RawEntry } from "@/lib/forensic/parse-skill-output";

/**
 * The REAL export layout the user's ZIPs use (verified against
 * 001-23-000001 / 001-24-000003 / 001-24-000014):
 *
 *   <code>/BA-...-EMB.pdf, WO-*, WB-*, info.txt
 *   <code>/_AUDIT_REPORT/<code>_DOC_COMPLETENESS.json   ← sorts FIRST
 *   <code>/_AUDIT_REPORT/<code>_FORENSIC_REPORT.json    ← the real dataset
 *   <code>/_AUDIT_REPORT/<code>_OCR_TEXT.txt
 *   <code>/_AUDIT_REPORT/Job_<code>_complaint_KN.{docx,pdf,txt}
 *
 * The completeness JSON shares the rich_json role and previously shadowed the
 * forensic report (alphabetical order) — these tests pin the ranked-candidate
 * selection.
 */

const CODE = "001-24-000003";
const P = (rel: string) => `${CODE}/${rel}`;

function realEntries(): RawEntry[] {
  return [
    // deliberately list DOC_COMPLETENESS before FORENSIC_REPORT — real zips do.
    {
      relPath: P(`_AUDIT_REPORT/${CODE}_DOC_COMPLETENESS.json`),
      size: 1942,
      text: JSON.stringify({ code: CODE, present: { photos: ["WB-photo1-before(28).pdf"], estimate: ["WO-1-Estimate.pdf"] }, missing: [] }),
    },
    {
      relPath: P(`_AUDIT_REPORT/${CODE}_FORENSIC_REPORT.json`),
      size: 32190,
      text: JSON.stringify({
        code: CODE,
        work: "Improvements to drains and roads at Maruthinagara in ward no 01 of Yelahanka sub division",
        wards: "ವಾರ್ಡ್ 001 (Kempegowda ward), ಯಲಹಂಕ ಉಪವಿಭಾಗ",
        zone: "ಯಲಹಂಕ ವಲಯ (Yelahanka Zone)",
        division: "ಯಲಹಂಕ ವಿಭಾಗ (Yelahanka Division)",
        sub_division: "ಯಲಹಂಕ ಉಪವಿಭಾಗ (Yelahanka Sub Division)",
        overall_risk: "Amber",
        grounds: [{ title: "Work slip revision beyond limit", risk: "Amber" }],
        chronology: [{ event: "Work order", date: "09-Mar-2024" }],
      }),
    },
    { relPath: P(`_AUDIT_REPORT/${CODE}_OCR_TEXT.txt`), size: 187130, text: "OCR DUMP OF ALL DOCUMENTS" },
    { relPath: P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.docx`), size: 53099, text: "" }, // docx text extraction failed
    { relPath: P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.pdf`), size: 330346 },
    { relPath: P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.txt`), size: 52175, text: "ಕನ್ನಡ ದೂರು ಪತ್ರ (letter text)" },
    { relPath: P("info.txt"), size: 2138, text: "Job Code       : 001-24-000003" },
    { relPath: P("WO-1-Estimate.pdf"), size: 3938347 },
    { relPath: P("BA-L4L4-ifms221-93246474-4-EMB.pdf"), size: 269245919 },
    { relPath: P("WB-CC-L4-ifms221-57059021-4-COMPLI.jpg"), size: 2723474 },
  ];
}

describe("_AUDIT_REPORT layout parsing", () => {
  it("classifies the layout's roles correctly", () => {
    expect(classifyRelPath(P(`_AUDIT_REPORT/${CODE}_FORENSIC_REPORT.json`))).toBe("rich_json");
    expect(classifyRelPath(P(`_AUDIT_REPORT/${CODE}_DOC_COMPLETENESS.json`))).toBe("rich_json");
    expect(classifyRelPath(P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.docx`))).toBe("letter_docx");
    expect(classifyRelPath(P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.pdf`))).toBe("letter_pdf");
    expect(classifyRelPath(P(`_AUDIT_REPORT/${CODE}_OCR_TEXT.txt`))).toBe("text");
    expect(classifyRelPath(P("info.txt"))).toBe("info");
    expect(classifyRelPath(P("BA-L4L4-ifms221-93246474-4-EMB.pdf"))).toBe("portal_pdf");
  });

  it("picks the FORENSIC_REPORT as the dataset even when DOC_COMPLETENESS sorts first", () => {
    const job = parseJob(CODE, realEntries());
    expect(job.source).toBe("json");
    expect(job.dataset?.work).toContain("Maruthinagara");
    expect(job.dataset?.division).toContain("Yelahanka");
    expect(job.riskColour).toBe("Amber");
  });

  it("folds the completeness JSON into document_presence", () => {
    const job = parseJob(CODE, realEntries());
    const presence = job.dataset?.document_presence as { present?: Record<string, unknown> } | undefined;
    expect(presence?.present).toBeTruthy();
  });

  it("uses the OCR dump as extractedText and the complaint .txt as the letter fallback", () => {
    const job = parseJob(CODE, realEntries());
    expect(job.extractedText).toBe("OCR DUMP OF ALL DOCUMENTS");
    expect(job.letterText).toContain("ಕನ್ನಡ ದೂರು ಪತ್ರ");
    expect(job.letterFileRel).toBe(P(`_AUDIT_REPORT/Job_${CODE}_complaint_KN.docx`));
  });

  it("keeps the skill's own sub-paths for R2 keys", () => {
    expect(forensicR2SubPath(P(`_AUDIT_REPORT/${CODE}_FORENSIC_REPORT.json`), CODE)).toBe(
      `_AUDIT_REPORT/${CODE}_FORENSIC_REPORT.json`,
    );
    expect(forensicR2SubPath(P("BA-L4L4-ifms221-93246474-4-EMB.pdf"), CODE)).toBe("BA-L4L4-ifms221-93246474-4-EMB.pdf");
  });
});
