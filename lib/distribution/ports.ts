/**
 * Document Distribution ports (dependency inversion). The distribution service
 * depends only on these interfaces, never on R2 / Puppeteer / the DB directly,
 * so it is unit-testable with mocks. Concrete adapters are wired in
 * lib/distribution/complaint-deps.ts. (Per ARB R1: no CaseIntelligencePort here —
 * that belongs to the Engineering Compliance context.)
 */
import type { RecipientEnrichment } from "./copy-to";

/** Persist a rendered artifact to object storage. */
export interface StoragePort {
  upload(args: { key: string; body: Buffer; contentType: string; contentLength?: number }): Promise<void>;
}

/** Render a letter body (Markdown) to a PDF buffer. */
export type VariantRenderer = (
  title: string,
  body: string,
  opts?: { reference?: string | null },
) => Promise<{ buffer: Buffer; fileName: string }>;

/** Best-effort resolution of a complaint's recipient roles to real officers. */
export type RecipientResolver = (complaintId: string) => Promise<RecipientEnrichment>;
