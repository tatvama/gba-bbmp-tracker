import { describe, it, expect } from "vitest";
import { computeBackoffMs, decideRetry } from "@/lib/jobs/retry-policy";

describe("computeBackoffMs", () => {
  it("doubles per attempt starting at 30s", () => {
    expect(computeBackoffMs(0)).toBe(30_000);
    expect(computeBackoffMs(1)).toBe(60_000);
    expect(computeBackoffMs(2)).toBe(120_000);
    expect(computeBackoffMs(3)).toBe(240_000);
  });

  it("caps at 30 minutes", () => {
    expect(computeBackoffMs(10)).toBe(30 * 60_000);
    expect(computeBackoffMs(100)).toBe(30 * 60_000);
  });

  it("treats a negative retryCount as 0", () => {
    expect(computeBackoffMs(-1)).toBe(30_000);
  });
});

describe("decideRetry", () => {
  const patterns = [/rate.?limit/i, /timeout/i];

  it("retries when the error matches a retryable pattern and attempts remain", () => {
    const d = decideRetry({ errorMsg: "Request timeout", explicitRetryable: undefined, retryableErrorPatterns: patterns, retryCount: 0, maxRetries: 3 });
    expect(d.shouldRetry).toBe(true);
    expect(d.backoffMs).toBe(30_000);
  });

  it("does not retry when the error doesn't match any pattern", () => {
    const d = decideRetry({ errorMsg: "Invalid input: missing field", explicitRetryable: undefined, retryableErrorPatterns: patterns, retryCount: 0, maxRetries: 3 });
    expect(d.shouldRetry).toBe(false);
  });

  it("stops retrying once maxRetries is reached even for a retryable error", () => {
    const d = decideRetry({ errorMsg: "rate limit exceeded", explicitRetryable: undefined, retryableErrorPatterns: patterns, retryCount: 3, maxRetries: 3 });
    expect(d.shouldRetry).toBe(false);
  });

  it("an explicit retryable:true overrides pattern matching", () => {
    const d = decideRetry({ errorMsg: "Invalid input", explicitRetryable: true, retryableErrorPatterns: patterns, retryCount: 0, maxRetries: 3 });
    expect(d.shouldRetry).toBe(true);
  });

  it("an explicit retryable:false overrides a matching pattern", () => {
    const d = decideRetry({ errorMsg: "rate limit exceeded", explicitRetryable: false, retryableErrorPatterns: patterns, retryCount: 0, maxRetries: 3 });
    expect(d.shouldRetry).toBe(false);
  });
});
