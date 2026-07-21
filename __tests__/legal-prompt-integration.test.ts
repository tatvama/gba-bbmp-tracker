import { describe, it, expect } from "vitest";
import { buildComplaintDraftPrompt } from "../lib/ai/complaint-document-analyzer";
import { resolveLegalFramework } from "../lib/legal/resolver";
import { renderLegalFramework } from "../lib/legal/renderer";
import type { LegalResolutionContext } from "../lib/legal/types";

const RULE_MARKER = "APPLICABLE LEGAL FRAMEWORK";
const RULE_CLAUSE = "NEVER invent or cite any Act, Rule, Section, Bye-law, Notification, Circular, Government Order or case that is not provided";
const PIL_ONLY = "you may cite ONLY the Acts, Rules, Bye-laws and Sections listed there";

function dto(partial: Partial<LegalResolutionContext>): LegalResolutionContext {
  return { type: "Other", receivingAuthority: "BBMP", draftKind: "followup_letter", hasForensicFindings: false, ...partial };
}

describe("legal framework — prompt assembly integration", () => {
  it("adds the citation HARD RULE to the system prompt for a structured kind", () => {
    const { system } = buildComplaintDraftPrompt({ kind: "followup_letter", complaintContext: "ctx" });
    expect(system).toContain(RULE_MARKER);
    expect(system).toContain(RULE_CLAUSE);
  });

  it("adds the citation HARD RULE for a non-structured kind too", () => {
    const { system } = buildComplaintDraftPrompt({ kind: "whatsapp", complaintContext: "ctx" });
    expect(system).toContain(RULE_CLAUSE);
  });

  it("leaves the PIL (legal_notice) prompt untouched — no injected DRAFT_SYSTEM rule", () => {
    const { system } = buildComplaintDraftPrompt({ kind: "legal_notice", complaintContext: "ctx" });
    expect(system).not.toContain(PIL_ONLY);
  });

  it("flows the rendered legal block through into the prompt context", () => {
    const block = renderLegalFramework(resolveLegalFramework(dto({ type: "Health", description: "garbage dumping" })));
    expect(block).not.toBe("");
    const { prompt } = buildComplaintDraftPrompt({ kind: "followup_letter", complaintContext: `Complaint facts.\n\n${block}` });
    const joined = prompt.map((p) => p.text).join("\n");
    expect(joined).toContain(RULE_MARKER);
    expect(joined).toContain("Solid Waste Management Rules, 2026");
  });
});
