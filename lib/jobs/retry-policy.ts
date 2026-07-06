/**
 * Pure retry/backoff decision logic, extracted out of lib/jobs/runner.ts so
 * it's unit-testable without a database — mirrors this codebase's convention
 * of unit-testing every pure decision function (evaluateReminderWorkflow,
 * scoreAckMatch, reconcileAction, draftKindsForConfig, ...).
 */

export interface RetryDecisionInput {
  errorMsg: string;
  explicitRetryable: boolean | undefined;
  retryableErrorPatterns: RegExp[];
  retryCount: number;
  maxRetries: number;
}

export interface RetryDecision {
  shouldRetry: boolean;
  /** Only meaningful when shouldRetry is true. */
  backoffMs: number;
}

const MAX_BACKOFF_MS = 30 * 60_000;
const BASE_BACKOFF_MS = 30_000;

/** Exponential backoff, doubling per attempt, capped at 30 minutes. */
export function computeBackoffMs(retryCount: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, retryCount), MAX_BACKOFF_MS);
}

/** Whether a failed job should auto-retry, and if so after how long. An
 *  explicit outcome.retryable from the handler always wins over pattern
 *  matching — the handler knows its own error better than a regex does. */
export function decideRetry(input: RetryDecisionInput): RetryDecision {
  const isRetryable = input.explicitRetryable ?? input.retryableErrorPatterns.some((p) => p.test(input.errorMsg));
  if (!isRetryable || input.retryCount >= input.maxRetries) {
    return { shouldRetry: false, backoffMs: 0 };
  }
  return { shouldRetry: true, backoffMs: computeBackoffMs(input.retryCount) };
}
