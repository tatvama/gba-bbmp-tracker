import { describe, it, expect } from "vitest";
import { adaptImportUpload, adaptAckBatch, adaptBackgroundJob, deriveOperationSubtype } from "@/lib/jobs/adapters";

describe("deriveOperationSubtype", () => {
  it("projects ai_draft's operation from input.kind", () => {
    expect(deriveOperationSubtype("ai_draft", { complaintId: "c1", kind: "counter_reply" })).toEqual({ operation: "counter_reply", subtype: null });
  });

  it("projects vision_scan's subtype from input.division (entityId is null for this type)", () => {
    expect(deriveOperationSubtype("vision_scan", { division: "North Zone" })).toEqual({ operation: null, subtype: "North Zone" });
  });

  it("projects nothing for types whose entityId is already precise (ocr, ifms_download, export)", () => {
    expect(deriveOperationSubtype("ocr", { documentId: "d1", analyze: true })).toEqual({ operation: null, subtype: null });
    expect(deriveOperationSubtype("ifms_download", { runId: "r1" })).toEqual({ operation: null, subtype: null });
  });

  it("degrades gracefully on missing/malformed input instead of throwing", () => {
    expect(deriveOperationSubtype("ai_draft", null)).toEqual({ operation: null, subtype: null });
    expect(deriveOperationSubtype("ai_draft", { kind: 123 })).toEqual({ operation: null, subtype: null });
    expect(deriveOperationSubtype("vision_scan", undefined)).toEqual({ operation: null, subtype: null });
  });
});

describe("adaptImportUpload", () => {
  it("maps 'review' to done and supplies a review-page link", () => {
    const t = adaptImportUpload({
      id: "abc", file_name: "job.zip", status: "review", stage: "Ready", progress: 100,
      message: null, error: null, created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.status).toBe("done");
    expect(t.source).toBe("import_uploads");
    expect(t.resultLink).toBe("/complaints/import?import=abc");
    expect(t.cancellable).toBe(false);
  });

  it("maps 'processing' to running and defaults the message when absent", () => {
    const t = adaptImportUpload({
      id: "abc", file_name: "job.zip", status: "processing", stage: "Extracting", progress: 40,
      message: null, error: null, created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.status).toBe("running");
    expect(t.message).toBeNull();
  });

  it("passes through failed as failed", () => {
    const t = adaptImportUpload({
      id: "abc", file_name: "job.zip", status: "failed", stage: null, progress: null,
      message: null, error: "boom", created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.status).toBe("failed");
    expect(t.error).toBe("boom");
  });
});

describe("adaptAckBatch", () => {
  it("computes progress from processed_pages / page_count", () => {
    const t = adaptAckBatch({
      id: "b1", original_name: "acks.pdf", status: "processing", stage: "OCR", message: null, error: null,
      page_count: 40, processed_pages: 10, created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.progress).toBe(25);
    expect(t.status).toBe("running");
  });

  it("maps 'review' to done with a review-page link", () => {
    const t = adaptAckBatch({
      id: "b1", original_name: "acks.pdf", status: "review", stage: null, message: null, error: null,
      page_count: 40, processed_pages: 40, created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.status).toBe("done");
    expect(t.resultLink).toBe("/complaints/acknowledgments/b1");
  });

  it("returns null progress when page_count is unknown", () => {
    const t = adaptAckBatch({
      id: "b1", original_name: "acks.pdf", status: "processing", stage: null, message: null, error: null,
      page_count: null, processed_pages: null, created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
    });
    expect(t.progress).toBeNull();
  });
});

describe("adaptBackgroundJob", () => {
  it("pulls stage/message out of the result jsonb and builds a resultLink when done", () => {
    const t = adaptBackgroundJob({
      id: "j1", type: "ai_draft", status: "done", title: "Counter-reply", entity_type: "complaint", entity_id: "c1",
      input: { complaintId: "c1", kind: "counter_reply" },
      progress: 100, result: { stage: "drafting", message: "almost there" }, error: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: "2026-01-01T00:05:00Z",
      cancel_requested: false, retry_count: 0, max_retries: 3, next_retry_at: null,
    });
    expect(t.source).toBe("background_jobs");
    expect(t.id).toBe("j1"); // unprefixed — retry/cancel actions use this id directly
    expect(t.module).toBe("AI Drafting");
    expect(t.stage).toBe("drafting");
    expect(t.message).toBe("almost there");
    expect(t.resultLink).toBe("/complaints/c1");
    expect(t.operation).toBe("counter_reply");
  });

  it("does not build a resultLink for a job that is not yet done", () => {
    const t = adaptBackgroundJob({
      id: "j1", type: "ai_draft", status: "running", title: "Counter-reply", entity_type: "complaint", entity_id: "c1",
      input: { complaintId: "c1", kind: "counter_reply" },
      progress: 40, result: null, error: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
      cancel_requested: false, retry_count: 0, max_retries: 3, next_retry_at: null,
    });
    expect(t.resultLink).toBeNull();
  });

  it("is never cancellable for ai_draft (no registered cancel point yet)", () => {
    const t = adaptBackgroundJob({
      id: "j1", type: "ai_draft", status: "running", title: "Counter-reply", entity_type: "complaint", entity_id: "c1",
      input: { complaintId: "c1", kind: "counter_reply" },
      progress: 40, result: null, error: null,
      created_at: "2026-01-01T00:00:00Z", updated_at: null, finished_at: null,
      cancel_requested: false, retry_count: 0, max_retries: 3, next_retry_at: null,
    });
    expect(t.cancellable).toBe(false);
  });
});
