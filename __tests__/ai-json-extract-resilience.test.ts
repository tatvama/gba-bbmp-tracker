import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Resilience coverage for lib/ai/json-extract.ts — previously untested
 * (production-stabilization audit finding). This is the shared strict-JSON
 * parser behind every forensic AI extractor; if it throws instead of
 * returning a structured failure, one bad model response could crash a
 * background job instead of degrading gracefully. Directly motivated by a
 * real Anthropic billing outage hit during this audit (400 "credit balance
 * too low"), which surfaced as exactly the r.ok===false path tested here.
 */

const mockIsAiConfigured = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("@/lib/ai/provider", () => ({
  isAiConfigured: () => mockIsAiConfigured(),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

describe("extractJson — resilience", () => {
  beforeEach(() => {
    mockIsAiConfigured.mockReset();
    mockGenerateText.mockReset();
  });

  it("short-circuits to the fallback when AI isn't configured (no API call attempted)", async () => {
    mockIsAiConfigured.mockReturnValue(false);
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson({ system: "s", prompt: "p", fallback: { x: 1 } });
    expect(result).toEqual({ ok: false, error: "AI not configured", data: { x: 1 } });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("degrades to the fallback (not a throw) when the provider call fails — e.g. a billing/credits error", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: false, error: "credit balance is too low", text: null });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson({ system: "s", prompt: "p", fallback: { x: 1 } });
    expect(result).toEqual({ ok: false, error: "credit balance is too low", data: { x: 1 } });
  });

  it("degrades to the fallback on an empty response body (ok=true but no text)", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: true, text: "" });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson({ system: "s", prompt: "p", fallback: { x: 1 } });
    expect(result.ok).toBe(false);
    expect(result.data).toEqual({ x: 1 });
  });

  it("parses clean JSON", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: true, text: '{"a":1,"b":"two"}' });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson<{ a: number; b: string }>({ system: "s", prompt: "p", fallback: { a: 0, b: "" } });
    expect(result).toEqual({ ok: true, data: { a: 1, b: "two" } });
  });

  it("strips a ```json ... ``` markdown fence before parsing", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: true, text: '```json\n{"a":1}\n```' });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson<{ a: number }>({ system: "s", prompt: "p", fallback: { a: 0 } });
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("recovers from a stray prefix/suffix by extracting the outermost {...}", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: true, text: 'Here is the JSON:\n{"a":1}\nHope that helps!' });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson<{ a: number }>({ system: "s", prompt: "p", fallback: { a: 0 } });
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("returns a structured failure (never throws) for genuinely unparseable output", async () => {
    mockIsAiConfigured.mockReturnValue(true);
    mockGenerateText.mockResolvedValue({ ok: true, text: "I cannot help with that request." });
    const { extractJson } = await import("@/lib/ai/json-extract");
    const result = await extractJson({ system: "s", prompt: "p", fallback: { a: 0 } });
    expect(result).toEqual({ ok: false, error: "Could not parse AI output", data: { a: 0 } });
  });
});
