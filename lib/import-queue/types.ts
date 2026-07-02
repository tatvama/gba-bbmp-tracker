/**
 * Shared types for the chunked, resumable import upload queue.
 * NOTE: no `import "server-only"` — the client upload manager and the SSE
 * consumer import these too (types + tiny pure helpers only).
 */

export const IMPORT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB per PUT
export const MAX_IMPORT_ZIP_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB per ZIP

export type ImportUploadStatus =
  | "uploading" // client is sending chunks
  | "queued" // fully staged; waiting for the worker (one upload at a time)
  | "processing" // worker: extracting / analyzing / committing
  | "review" // analyzed with auto-commit off — waiting for the user's review
  | "done" // complaints created
  | "failed"
  | "cancelled";

export interface ImportUploadEvent {
  /** epoch ms */
  t: number;
  stage: string;
  msg: string;
}

/** One upload session as streamed to the client (SSE) / returned by the API. */
export interface ImportUploadSnapshot {
  id: string;
  kind: string;
  fileName: string;
  fileSize: number;
  fingerprint: string;
  chunkSize: number;
  receivedBytes: number;
  status: ImportUploadStatus;
  stage: string | null;
  /** 0..100 across the whole pipeline (upload → extract → analyze → commit). */
  progress: number;
  message: string | null;
  error: string | null;
  autoCommit: boolean;
  batchId: string | null;
  jobCodes: string[];
  complaintIds: string[];
  createdAt: string;
  finishedAt: string | null;
  events: ImportUploadEvent[];
}

/** SSE wire message. A full snapshot every time — tiny (a handful of rows). */
export interface ImportEventsPayload {
  type: "snapshot";
  sessions: ImportUploadSnapshot[];
}

/** Identity used to match a re-selected file to an interrupted session. */
export function fileFingerprint(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}|${f.size}|${f.lastModified}`;
}

/**
 * Overall-progress bands per pipeline stage, so the single progress bar moves
 * monotonically through upload → extract → analyze → commit.
 */
export const PROGRESS_BANDS = {
  upload: [0, 35],
  extract: [35, 55],
  analyze: [55, 72],
  commit: [72, 99],
} as const;

export function bandProgress(band: keyof typeof PROGRESS_BANDS, fraction: number): number {
  const [lo, hi] = PROGRESS_BANDS[band];
  const f = Math.min(1, Math.max(0, fraction));
  return Math.round(lo + (hi - lo) * f);
}
