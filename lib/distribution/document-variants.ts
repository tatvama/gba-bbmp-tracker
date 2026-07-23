/**
 * Document Variant Registry (open vocabulary). A filed complaint letter is
 * rendered into one or more variants; today the Distribution service produces
 * `recipient` and `office`. Future variants (signed / dispatch / archived /
 * digitally_signed) are declared here as reserved so the DB column and lineage
 * already accept them — adding a real one later is a renderer + a flag flip, no
 * migration (the DB stores the string; this registry is the validator).
 */

export interface DocumentVariantDescriptor {
  key: string;
  /** complaint_documents.document_type for this variant (recipient uses the letter's own type). */
  documentType: string | null;
  /** Marker line stamped at the top of the rendered body, if any. */
  marker?: string;
  /** Whether the variant carries the full internal distribution list. */
  includesFullDistribution: boolean;
  /** Designed but not yet produced by any renderer. */
  reserved?: boolean;
}

export const DOCUMENT_VARIANTS = {
  recipient: { key: "recipient", documentType: null, includesFullDistribution: false },
  office: { key: "office", documentType: "Office copy (PDF)", marker: "OFFICE COPY - NOT FOR DISPATCH", includesFullDistribution: true },
  // A copy of the letter re-addressed to a division's TVCC (Technical Vigilance &
  // Control Cell) — same complaint body, TVCC addressee. Linked to the primary
  // letter via parent_document_id, exactly like the office copy.
  tvcc_copy: { key: "tvcc_copy", documentType: "TVCC copy (PDF)", includesFullDistribution: false },
  // Reserved (no renderer registered yet):
  signed: { key: "signed", documentType: "Signed copy (PDF)", includesFullDistribution: false, reserved: true },
  dispatch: { key: "dispatch", documentType: "Dispatch copy (PDF)", includesFullDistribution: false, reserved: true },
  archived: { key: "archived", documentType: "Archived copy (PDF)", includesFullDistribution: false, reserved: true },
  digitally_signed: { key: "digitally_signed", documentType: "Digitally signed copy (PDF)", includesFullDistribution: false, reserved: true },
} satisfies Record<string, DocumentVariantDescriptor>;

export type DocumentVariant = keyof typeof DOCUMENT_VARIANTS;

export function isKnownVariant(v: string): boolean {
  return Object.prototype.hasOwnProperty.call(DOCUMENT_VARIANTS, v);
}

/** Variants a renderer can currently produce (not reserved). */
export function activeVariants(): DocumentVariantDescriptor[] {
  return Object.values(DOCUMENT_VARIANTS).filter((v) => !("reserved" in v && v.reserved));
}
