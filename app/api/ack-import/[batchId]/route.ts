import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { COMPLAINT_FIELD_ROLES } from "@/lib/constants";
import { createAdminClient } from "@/lib/db";
import type { AckBatchProgress, AckBatchStatus } from "@/lib/complaints/ack-reconcile";

export const runtime = "nodejs";

/** Live processing progress for a batch — the review page polls this while the
 *  background runner renders/OCRs/matches, then stops once status is `review`. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const user = await getSessionUser();
  if (!user || !hasRole(user, COMPLAINT_FIELD_ROLES)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ack_import_batches")
    .select("status, stage, message, error, page_count, processed_pages")
    .eq("id", batchId)
    .single();
  if (error || !data) return NextResponse.json({ error: "Batch not found." }, { status: 404 });

  const { count } = await admin
    .from("ack_import_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  const b = data as {
    status: AckBatchStatus; stage: string | null; message: string | null;
    error: string | null; page_count: number; processed_pages: number;
  };
  const body: AckBatchProgress = {
    status: b.status,
    stage: b.stage,
    message: b.message,
    error: b.error,
    pageCount: b.page_count,
    processedPages: b.processed_pages,
    itemCount: count ?? 0,
  };
  return NextResponse.json(body);
}
