import { describe, it, expect } from "vitest";
import { matchesIdentity, type TaskFilter } from "@/lib/jobs/client/task-identity";
import type { TaskItem } from "@/lib/jobs/types";

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "j1",
    source: "background_jobs",
    type: "ai_draft",
    module: "AI Drafting",
    title: "Counter-reply",
    status: "running",
    entityType: "complaint",
    entityId: "c1",
    operation: "counter_reply",
    subtype: null,
    progress: 40,
    stage: null,
    message: null,
    result: null,
    error: null,
    cancellable: false,
    resultLink: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

describe("matchesIdentity", () => {
  it("matches when every specified field agrees", () => {
    const t = task();
    expect(matchesIdentity(t, { taskType: "ai_draft", entityType: "complaint", entityId: "c1", operation: "counter_reply" })).toBe(true);
  });

  it("treats an unspecified field as a wildcard", () => {
    const t = task();
    expect(matchesIdentity(t, { taskType: "ai_draft" })).toBe(true);
    expect(matchesIdentity(t, {})).toBe(true);
  });

  it("rejects on taskType mismatch", () => {
    expect(matchesIdentity(task(), { taskType: "ocr" })).toBe(false);
  });

  it("rejects on entityId mismatch — the exact bug this replaces title-substring matching for", () => {
    expect(matchesIdentity(task(), { taskType: "ai_draft", entityId: "different-complaint" })).toBe(false);
  });

  it("distinguishes two draft kinds on the same complaint via operation", () => {
    const counterReply = task({ operation: "counter_reply" });
    const reminder = task({ operation: "reminder_email" });
    const filter: TaskFilter = { taskType: "ai_draft", entityType: "complaint", entityId: "c1", operation: "counter_reply" };
    expect(matchesIdentity(counterReply, filter)).toBe(true);
    expect(matchesIdentity(reminder, filter)).toBe(false);
  });

  it("matches vision_scan tasks by subtype (division) when entityId is null", () => {
    const scanA = task({ type: "vision_scan", entityType: null, entityId: null, operation: null, subtype: "North Zone" });
    const scanB = task({ type: "vision_scan", entityType: null, entityId: null, operation: null, subtype: "South Zone" });
    const filter: TaskFilter = { taskType: "vision_scan", subtype: "North Zone" };
    expect(matchesIdentity(scanA, filter)).toBe(true);
    expect(matchesIdentity(scanB, filter)).toBe(false);
  });

  it("matches by taskType alone when the filter doesn't narrow further", () => {
    const t = task({ type: "export", entityType: "complaint", entityId: "c1", operation: null, subtype: null });
    expect(matchesIdentity(t, { taskType: "export" })).toBe(true);
  });

  it("explicit null is a real value to match, not a wildcard", () => {
    const t = task({ subtype: null });
    expect(matchesIdentity(t, { subtype: null })).toBe(true);
    expect(matchesIdentity(t, { subtype: "something" })).toBe(false);
  });
});
