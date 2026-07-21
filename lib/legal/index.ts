/**
 * Legal Framework Engine — public API.
 *
 * Typical use in the drafting engine:
 *   const dto      = buildLegalResolutionContext(complaintRow, { draftKind, hasForensicFindings });
 *   const resolved = resolveLegalFramework(dto);
 *   const block    = renderLegalFramework(resolved);   // "" when nothing applies
 *   // ...append `block` to the drafting context; after generation:
 *   const warnings = validateDraftCitations(letterText, resolved, { contextText });
 */
export type {
  LegalPriority,
  LegalConfidence,
  LegalAuthority,
  InstrumentKind,
  LegalProvision,
  LegalReference,
  LegalResolutionContext,
  ResolvedReference,
  ResolvedLegalFramework,
} from "@/lib/legal/types";

export { buildLegalResolutionContext } from "@/lib/legal/context";
export { resolveReceivingAuthority } from "@/lib/legal/authority";
export { resolveLegalFramework, MAX_REFERENCES } from "@/lib/legal/resolver";
export { renderLegalFramework } from "@/lib/legal/renderer";
export { validateKnowledgeBase, validateDraftCitations } from "@/lib/legal/validate";
export { getKnowledgeBase, ACTIVE_KB_VERSION } from "@/lib/legal/knowledge";
export type { KnowledgeBaseProvider } from "@/lib/legal/knowledge/provider";
