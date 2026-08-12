import "server-only";
import type { DbClient } from "@/lib/db";
import { uploadToR2 } from "@/lib/storage/r2-upload";
import { generateDraftPdfService } from "@/lib/pdf/document-service";
import { resolveComplaintRecipients } from "./resolve-recipients";
import type { DistributionDeps } from "./distribution-service";

/**
 * Concrete adapters wiring the Distribution service to this app's infrastructure
 * (R2 storage, the Puppeteer/Markdown PDF renderer, the contacts-backed recipient
 * resolver). Kept separate from distribution-service.ts so the pure service can
 * be unit-tested without importing Puppeteer / R2 / the AI stack.
 */
export function complaintDistributionDeps(admin: DbClient): DistributionDeps {
  return {
    admin,
    storage: { upload: async (args) => { await uploadToR2(args); } },
    render: (title, body, opts) => generateDraftPdfService(title, body, undefined, opts),
    resolve: (complaintId) => resolveComplaintRecipients(admin, complaintId),
  };
}
