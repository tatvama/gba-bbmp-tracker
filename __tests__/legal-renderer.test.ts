import { describe, it, expect } from "vitest";
import { resolveLegalFramework } from "../lib/legal/resolver";
import { renderLegalFramework } from "../lib/legal/renderer";
import type { LegalResolutionContext } from "../lib/legal/types";

function dto(partial: Partial<LegalResolutionContext>): LegalResolutionContext {
  return { type: "Other", receivingAuthority: "BBMP", draftKind: "followup_letter", hasForensicFindings: false, ...partial };
}

describe("legal renderer", () => {
  const resolved = resolveLegalFramework(dto({ type: "Health", description: "garbage dumping and a black spot" }));
  const block = renderLegalFramework(resolved);

  it("returns an empty string when nothing resolved", () => {
    expect(renderLegalFramework(null)).toBe("");
    expect(renderLegalFramework({ version: "v1", references: [], trace: [] })).toBe("");
  });

  it("lists the resolved instruments with priority and suggested wording", () => {
    expect(block).toContain("Solid Waste Management Rules, 2026");
    expect(block).toMatch(/priority: (High|Medium)/);
    expect(block).toContain("Suggested wording:");
  });

  it("contains no bracketed placeholders and no en/em dashes", () => {
    expect(block).not.toContain("["); // no [NAME]/[DATE]-style tokens, and no bracketed header
    expect(block).not.toMatch(/[–—]/); // no en/em dash in prose
  });

  it("never leaks internal explainability (reason / trace / score / source)", () => {
    // The KMC reason text and internal field names must not appear in the block.
    expect(block).not.toContain("operative substantive law");
    expect(block).not.toContain("matchedFactors");
    expect(block).not.toContain("reasonInternal");
    expect(block).not.toContain("score");
  });
});
