/**
 * Side-effect-only: importing this file registers every background job
 * type's handler (each ./*.ts file calls registerJobHandler at module load).
 * Any code path that might dispatch/retry/sweep a job — lib/actions/jobs.ts
 * (starts + retries jobs) and instrumentation.ts (the due-retry/dead-job
 * sweep) — imports this once so every job type is dispatchable regardless of
 * which one it happens to be handling.
 */
import "./ai-draft";
import "./ocr";
import "./vision-scan";
// Stage 7: import "./export";
import "./ifms-download";

export {};
