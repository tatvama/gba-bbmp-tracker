/**
 * Copy-To renderer (PURE, framework-free, unit-tested). Turns selected recipient
 * roles into a deterministic Markdown "Copy To" block, and builds the office-copy
 * body carrying the full internal distribution. Role titles come from the
 * recipient-role registry; a real officer name/office is shown only when the
 * resolver supplied one (best-effort enrichment). No AI, no invented figures.
 */
import type { RecipientRoleKey } from "@/lib/complaints/recipient-roles";
import { COMPLAINT_RECIPIENT_ROLES, officeCopyRoleKeys, roleByKey } from "@/lib/complaints/recipient-roles";
import { DOCUMENT_VARIANTS } from "./document-variants";
import type { LetterRecipient } from "@/lib/letters/types";

export type RecipientEnrichment = Partial<Record<RecipientRoleKey, LetterRecipient>>;

/** Coerce to a trimmed, table/prose-safe string (dashes → ASCII). */
function clean(s: unknown): string {
  return (s == null ? "" : String(s)).trim().replace(/[–—―]/g, "-");
}

function roleLine(key: RecipientRoleKey, enrich?: RecipientEnrichment): string | null {
  const r = roleByKey(key);
  if (!r) return null;
  const officer = enrich?.[key];
  const name = officer?.name ? `, ${clean(officer.name)}` : "";
  const office = officer?.office ? ` (${clean(officer.office)})` : "";
  return `${r.title} - ${r.level}${name}${office}`;
}

/** Render an ordered "## Copy To" block for the given role keys (empty → ""). */
function block(keys: RecipientRoleKey[], enrich?: RecipientEnrichment): string {
  const wanted = new Set(keys);
  const items = COMPLAINT_RECIPIENT_ROLES.filter((r) => wanted.has(r.key))
    .map((r) => roleLine(r.key, enrich))
    .filter((l): l is string => Boolean(l));
  if (!items.length) return "";
  return ["## Copy To", "", ...items.map((t, i) => `${i + 1}. ${t}`)].join("\n");
}

/** Copy-To for the recipient copy = the user's selected roles (empty selection → ""). */
export function buildCopyToBlock(selected: RecipientRoleKey[], enrich?: RecipientEnrichment): string {
  return block(selected ?? [], enrich);
}

/** The mandatory internal Office Copy distribution = every officeCopy role. */
export function buildOfficeDistributionBlock(enrich?: RecipientEnrichment): string {
  return block(officeCopyRoleKeys(), enrich);
}

/** Remove any AI-produced trailing "Copy To" section, then append the given block. */
export function applyCopyTo(markdown: string, copyToBlock: string): string {
  const md = markdown ?? "";
  // First heading / bold / numbered line that starts "Copy To" → cut to end.
  const m = md.match(/^[>\s]*(?:#{1,6}\s*)?(?:\*\*\s*)?(?:\d+[.)]\s*)?copy\s*to\b/im);
  const base = (m && m.index != null ? md.slice(0, m.index) : md).trimEnd();
  return copyToBlock ? `${base}\n\n${copyToBlock}\n` : `${base}\n`;
}

/** Office-copy body = marker + letter with the Copy-To replaced by the full distribution. */
export function officeCopyBody(markdown: string, enrich?: RecipientEnrichment): string {
  const marker = DOCUMENT_VARIANTS.office.marker ?? "OFFICE COPY";
  return `**${marker}**\n\n${applyCopyTo(markdown, buildOfficeDistributionBlock(enrich))}`;
}

/** Structured snapshot of the Copy-To entries (persisted as the `copy_to` jsonb). */
export function toRecipientList(keys: RecipientRoleKey[], enrich?: RecipientEnrichment): LetterRecipient[] {
  const wanted = new Set(keys);
  return COMPLAINT_RECIPIENT_ROLES.filter((r) => wanted.has(r.key)).map((r) => {
    const o = enrich?.[r.key];
    return {
      name: o?.name ?? null,
      designation: r.title,
      office: o?.office ?? r.level,
      address: o?.address ?? null,
    };
  });
}
