/**
 * Renderer — turns a ResolvedLegalFramework into the context block appended to the
 * drafting prompt. It mirrors the "=== … ===" context-marker style already used for
 * the case-history / case-intelligence blocks (lib/ai/complaint-draft.ts).
 *
 * Guarantees (plan §8):
 *  - Emits only the provisions the resolver kept (High/Medium confidence).
 *  - Groups provisions under one instrument (each Act appears once).
 *  - Includes each provision's reusable template as suggested wording.
 *  - NEVER emits the internal reason / conditions / trace / source / score.
 *  - No square-bracket placeholders and no en/em dashes, so the block reads cleanly,
 *    survives the safe-language gate, and translates cleanly to Kannada/Bilingual.
 *  - Returns "" when nothing resolved (the engine then appends nothing).
 */
import type { ResolvedLegalFramework } from "@/lib/legal/types";

const HEADER =
  "=== APPLICABLE LEGAL FRAMEWORK (cite ONLY from this list; include only what the facts support) ===";
const GUIDANCE =
  "Weave the genuinely applicable provisions below into the relevant part of the letter. Prefer the High priority items. Include a Medium item only where the facts of this complaint support it. Explain the obligation in plain professional language, do not quote the statute, and do not cite anything that is not listed here or already named in the case history.";

export function renderLegalFramework(resolved: ResolvedLegalFramework | null): string {
  if (!resolved || resolved.references.length === 0) return "";

  const lines: string[] = [HEADER, GUIDANCE, ""];

  for (const r of resolved.references) {
    lines.push(`- ${r.reference.instrument}, ${r.reference.year} (priority: ${r.effectivePriority})`);
    for (const p of r.provisions) {
      const label = p.ref ? `${p.ref}: ` : "";
      lines.push(`    - ${label}${p.obligation}`);
      lines.push(`      Suggested wording: "${p.template}"`);
    }
  }

  return lines.join("\n");
}
