import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cacheControl, buildSystemParam, buildUserContent, requestOptionsFor } from "@/lib/ai/provider";
import { isPromptCacheEnabled } from "@/lib/ai/cache-config";

describe("cache-config", () => {
  const original = process.env.ANTHROPIC_PROMPT_CACHE;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_PROMPT_CACHE;
    else process.env.ANTHROPIC_PROMPT_CACHE = original;
  });

  it("defaults to enabled when unset", () => {
    delete process.env.ANTHROPIC_PROMPT_CACHE;
    expect(isPromptCacheEnabled()).toBe(true);
  });

  it("disables only on the literal string 'false' (case-insensitive)", () => {
    process.env.ANTHROPIC_PROMPT_CACHE = "false";
    expect(isPromptCacheEnabled()).toBe(false);
    process.env.ANTHROPIC_PROMPT_CACHE = "FALSE";
    expect(isPromptCacheEnabled()).toBe(false);
  });

  it("stays enabled for any other value", () => {
    process.env.ANTHROPIC_PROMPT_CACHE = "true";
    expect(isPromptCacheEnabled()).toBe(true);
    process.env.ANTHROPIC_PROMPT_CACHE = "1";
    expect(isPromptCacheEnabled()).toBe(true);
  });
});

describe("cacheControl", () => {
  it("defaults to the 5m ephemeral shape with no ttl field", () => {
    expect(cacheControl(undefined)).toEqual({ type: "ephemeral" });
    expect(cacheControl("5m")).toEqual({ type: "ephemeral" });
  });

  it("adds ttl only for 1h", () => {
    expect(cacheControl("1h")).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});

describe("buildSystemParam / buildUserContent (caching enabled)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_PROMPT_CACHE; // enabled by default
  });

  it("passes system through unchanged when cache.system is not set", () => {
    expect(buildSystemParam("You are helpful.", undefined)).toBe("You are helpful.");
    expect(buildSystemParam("You are helpful.", {})).toBe("You are helpful.");
  });

  it("wraps system in a single cache_control block when cache.system is true", () => {
    const out = buildSystemParam("You are helpful.", { system: true });
    expect(out).toEqual([{ type: "text", text: "You are helpful.", cache_control: { type: "ephemeral" } }]);
  });

  it("honors ttl on the system block", () => {
    const out = buildSystemParam("Rules.", { system: true, ttl: "1h" });
    expect(out).toEqual([{ type: "text", text: "Rules.", cache_control: { type: "ephemeral", ttl: "1h" } }]);
  });

  it("passes a plain string prompt through unchanged", () => {
    expect(buildUserContent("hello world", { system: true })).toBe("hello world");
  });

  it("expands PromptSegment[] into content blocks, cache_control only on marked segments", () => {
    const out = buildUserContent(
      [
        { text: "STABLE CONTEXT", cache: true },
        { text: "dynamic tail" },
      ],
      { ttl: "1h" },
    );
    expect(out).toEqual([
      { type: "text", text: "STABLE CONTEXT", cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: "dynamic tail" },
    ]);
  });

  it("concatenating a PromptSegment[] result's text equals the original single-string prompt it replaces", () => {
    const segments = [{ text: "Complaint context:\nfoo", cache: true }, { text: "\n\nDraft: bar." }];
    const out = buildUserContent(segments, undefined) as { text: string }[];
    const concatenated = out.map((b) => b.text).join("");
    expect(concatenated).toBe("Complaint context:\nfoo\n\nDraft: bar.");
  });
});

describe("buildSystemParam / buildUserContent (caching disabled)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_PROMPT_CACHE = "false";
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_PROMPT_CACHE;
  });

  it("returns system as a plain string even when cache.system is true", () => {
    expect(buildSystemParam("You are helpful.", { system: true })).toBe("You are helpful.");
  });

  it("rejoins PromptSegment[] into one string, byte-identical to simple concatenation", () => {
    const segments = [{ text: "Complaint context:\nfoo", cache: true }, { text: "\n\nDraft: bar." }];
    expect(buildUserContent(segments, { system: true })).toBe("Complaint context:\nfoo\n\nDraft: bar.");
  });
});

describe("requestOptionsFor", () => {
  const original = process.env.ANTHROPIC_PROMPT_CACHE;
  afterEach(() => {
    if (original === undefined) delete process.env.ANTHROPIC_PROMPT_CACHE;
    else process.env.ANTHROPIC_PROMPT_CACHE = original;
  });

  it("returns undefined when no ttl or ttl is the 5m default", () => {
    delete process.env.ANTHROPIC_PROMPT_CACHE;
    expect(requestOptionsFor(undefined)).toBeUndefined();
    expect(requestOptionsFor({ system: true })).toBeUndefined();
    expect(requestOptionsFor({ system: true, ttl: "5m" })).toBeUndefined();
  });

  it("adds the extended-cache-ttl beta header only for ttl: 1h", () => {
    delete process.env.ANTHROPIC_PROMPT_CACHE;
    expect(requestOptionsFor({ ttl: "1h" })).toEqual({ headers: { "anthropic-beta": "extended-cache-ttl-2025-04-11" } });
  });

  it("omits the header when caching is disabled, even with ttl: 1h", () => {
    process.env.ANTHROPIC_PROMPT_CACHE = "false";
    expect(requestOptionsFor({ ttl: "1h" })).toBeUndefined();
  });
});
