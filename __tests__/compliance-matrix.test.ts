import { describe, it, expect } from "vitest";
import { runComplianceMatrix, runComplianceMatrixRanked, complianceSummary } from "../lib/compliance/engine";
import { ENGINEERING_COMPLIANCE_MATRIX, RULE_VERSION } from "../lib/compliance/matrix";
import type { CaseIntelligence } from "../lib/intelligence/types";

/** Minimal artifact carrying only the fields the matrix projects over. */
function makeIntel(p: Partial<{
  jobNumber: string | null;
  compliance: any[];
  findings: any[];
  correlations: any[];
  references: any[];
  insuranceCoverage: any;
  scheduleBTables: any;
  tvcc: any;
  documentsToDemand: string[];
}>): CaseIntelligence {
  return {
    meta: { jobNumber: p.jobNumber ?? null },
    compliance: p.compliance ?? [],
    findings: p.findings ?? [],
    correlations: p.correlations ?? [],
    references: p.references ?? [],
    insuranceCoverage: p.insuranceCoverage ?? null,
    scheduleBTables: p.scheduleBTables ?? null,
    tvcc: p.tvcc ?? null,
    synthesis: { documentsToDemand: p.documentsToDemand ?? [] },
  } as unknown as CaseIntelligence;
}

const byKey = (fs: ReturnType<typeof runComplianceMatrix>, k: string) => fs.find((f) => f.key === k)!;

describe("Engineering Compliance Matrix", () => {
  it("emits one finding per registered dimension, each tagged with the rule version", () => {
    const fs = runComplianceMatrix(makeIntel({ jobNumber: "209-26-000007" }));
    expect(fs).toHaveLength(ENGINEERING_COMPLIANCE_MATRIX.length);
    expect(fs.every((f) => f.ruleVersion === RULE_VERSION)).toBe(true);
    expect(fs.every((f) => typeof f.reason === "string" && f.reason.length > 0)).toBe(true);
  });

  it("marks a works-case dimension with no data as not_shown", () => {
    const fs = runComplianceMatrix(makeIntel({ jobNumber: "J1" }));
    expect(byKey(fs, "measurement_book").status).toBe("not_shown");
  });

  it("marks every dimension not_applicable for a non-works complaint", () => {
    const fs = runComplianceMatrix(makeIntel({ jobNumber: null }));
    expect(fs.every((f) => f.status === "not_applicable")).toBe(true);
  });

  it("maps a met ComplianceItem area to a met dimension", () => {
    const fs = runComplianceMatrix(makeIntel({
      jobNumber: "J1",
      references: [{ label: "Technical Sanction (TS)", value: "CE/TS/06", evidenceIds: [] }],
      compliance: [{ area: "Technical Sanction (TS)", requirement: "TS on record", status: "met", evidenceIds: [] }],
    }));
    expect(byKey(fs, "technical_sanction").status).toBe("met");
  });

  it("maps a finding category to a discrepancy with the finding's severity", () => {
    const fs = runComplianceMatrix(makeIntel({
      jobNumber: "J1",
      findings: [{ category: "QUANTITY", statement: "Item 42 over 125%", code: "QTY-01", severity: "High", evidenceIds: ["ev_1"], ruleRefs: ["KTPP"] }],
    }));
    const boq = byKey(fs, "boq_schedule_b");
    expect(boq.status).toBe("discrepancy");
    expect(boq.severity).toBe("High");
    expect(boq.evidenceUsed).toContain("ev_1");
  });

  it("insurance dimension reads the coverage table (partial → discrepancy)", () => {
    const insuranceCoverage = { rows: [{ status: "On record (POL/1)" }, { status: "Not on record" }, { status: "Not on record" }], ruleRef: "KW-4 Clause 13" };
    const fs = runComplianceMatrix(makeIntel({ jobNumber: "J1", insuranceCoverage }));
    const ins = byKey(fs, "insurance");
    expect(ins.status).toBe("discrepancy");
    expect(ins.reason).toMatch(/1 of 3/);
  });

  it("insurance dimension: none on record → not_shown / High", () => {
    const insuranceCoverage = { rows: [{ status: "Not on record" }, { status: "Not on record" }], ruleRef: "KW-4 Clause 13" };
    const ins = byKey(runComplianceMatrix(makeIntel({ jobNumber: "J1", insuranceCoverage })), "insurance");
    expect(ins.status).toBe("not_shown");
    expect(ins.severity).toBe("High");
  });

  it("TVCC dimension propagates the tvcc snapshot status", () => {
    const tvcc = { reportsFound: [{ reference: "TVCC/1" }], coverage: [], crossChecks: [], status: "discrepancy", note: "cross-check pending" };
    const t = byKey(runComplianceMatrix(makeIntel({ jobNumber: "J1", tvcc })), "tvcc");
    expect(t.status).toBe("discrepancy");
    expect(t.severity).toBe("High");
  });

  it("TVCC partial coverage (unknown) is Low severity — not scored above having no report", () => {
    const unknown = byKey(runComplianceMatrix(makeIntel({ jobNumber: "J1", tvcc: { reportsFound: [{ reference: "T/1" }], coverage: [], crossChecks: [], status: "unknown" } })), "tvcc");
    const notShown = byKey(runComplianceMatrix(makeIntel({ jobNumber: "J1", tvcc: { reportsFound: [], coverage: [], crossChecks: [], status: "not_shown" } })), "tvcc");
    expect(unknown.severity).toBe("Low");
    expect(notShown.severity).toBe("Medium"); // absence is more serious than a partial-but-clean set
  });

  it("a 'met' sibling record does NOT mask a 'not_shown' one in the same dimension", () => {
    // material_procurement spans MDP + Royalty: Royalty on record (met) but MDP absent (not_shown).
    const fs = runComplianceMatrix(makeIntel({
      jobNumber: "J1",
      references: [{ label: "Royalty Challan", value: "RC/9", evidenceIds: [] }],
      compliance: [
        { area: "Royalty Challan", requirement: "Royalty Challan on record", status: "met", evidenceIds: [] },
        { area: "Mineral Dispatch Permit (MDP)", requirement: "MDP on record", status: "not_shown", recordToDemand: "Certified copy of the MDP", evidenceIds: [] },
      ],
    }));
    expect(byKey(fs, "material_procurement").status).toBe("not_shown");
    expect(byKey(fs, "royalty").status).toBe("met"); // royalty alone is genuinely met
    expect(byKey(fs, "mdp").status).toBe("not_shown");
  });

  it("surfaces an analyze-derived 'discrepancy' compliance item as a discrepancy (not not_shown)", () => {
    const fs = runComplianceMatrix(makeIntel({
      jobNumber: "J1",
      compliance: [{ area: "Measurement Book integrity", requirement: "MB findings", status: "discrepancy", detail: "MB gaps", evidenceIds: ["ev_9"] }],
    }));
    expect(byKey(fs, "measurement_book").status).toBe("discrepancy");
  });

  it("ranks discrepancies before gaps before met", () => {
    const fs = runComplianceMatrixRanked(makeIntel({
      jobNumber: "J1",
      findings: [{ category: "INSURANCE", statement: "x", severity: "High", evidenceIds: [], ruleRefs: [] }],
      references: [{ label: "Work Order", value: "WO/1", evidenceIds: [] }],
      compliance: [{ area: "Work Order", requirement: "WO on record", status: "met", evidenceIds: [] }],
    }));
    const firstMet = fs.findIndex((f) => f.status === "met");
    const lastDiscrepancy = fs.map((f) => f.status).lastIndexOf("discrepancy");
    expect(lastDiscrepancy).toBeLessThan(firstMet);
  });

  it("complianceSummary rolls up counts", () => {
    const fs = runComplianceMatrix(makeIntel({
      jobNumber: "J1",
      references: [{ label: "Work Order", value: "WO/1", evidenceIds: [] }],
      compliance: [{ area: "Work Order", requirement: "WO on record", status: "met", evidenceIds: [] }],
    }));
    const s = complianceSummary(fs);
    expect(s.total).toBe(ENGINEERING_COMPLIANCE_MATRIX.length);
    expect(s.met).toBeGreaterThanOrEqual(1);
    expect(s.discrepancy + s.notShown + s.met).toBeLessThanOrEqual(s.total);
  });
});
