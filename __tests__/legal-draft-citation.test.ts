import { describe, it, expect } from "vitest";
import { resolveLegalFramework } from "../lib/legal/resolver";
import { validateDraftCitations } from "../lib/legal/validate";
import type { LegalResolutionContext } from "../lib/legal/types";

function dto(partial: Partial<LegalResolutionContext>): LegalResolutionContext {
  return { type: "Other", receivingAuthority: "BBMP", draftKind: "followup_letter", hasForensicFindings: false, ...partial };
}

const resolved = resolveLegalFramework(dto({ type: "Health", description: "garbage dumping and a black spot" }));

describe("post-draft citation validator", () => {
  it("passes a letter that cites only the resolved framework", () => {
    const text = "The condition is inconsistent with the Solid Waste Management Rules, 2026, and engages the Environment (Protection) Act, 1986.";
    expect(validateDraftCitations(text, resolved)).toEqual([]);
  });

  it("flags a fabricated citation", () => {
    const text = "This attracts Section 999 of the Imaginary Act, 2099.";
    const warnings = validateDraftCitations(text, resolved);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(" ")).toMatch(/Imaginary Act, 2099/);
  });

  it("flags a stale-year citation of an otherwise-known instrument", () => {
    const text = "As required by the Solid Waste Management Rules, 2016.";
    const warnings = validateDraftCitations(text, resolved);
    expect(warnings.join(" ")).toMatch(/year does not match/);
  });

  it("allows a citation that is grounded in the provided context / case history", () => {
    const text = "The procurement engaged the Karnataka Transparency in Public Procurement Act, 1999.";
    const contextText = "Forensic history: the Karnataka Transparency in Public Procurement Act, 1999 was cited in the audit.";
    expect(validateDraftCitations(text, resolved, { contextText })).toEqual([]);
  });

  it("does not flag job/case-code dashes or non-statutory prose", () => {
    const text = "With reference to job 222-12-345678 and case BBMP-2026-014, kindly verify the records.";
    expect(validateDraftCitations(text, resolved)).toEqual([]);
  });
});
