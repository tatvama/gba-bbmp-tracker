-- -----------------------------------------------------------------------------
-- 0024_import_upload_queue — chunked, resumable forensic-ZIP uploads + a
-- server-side processing queue with live progress.
--
--   The skill export ZIPs are 0.6–1.6 GB — far beyond what a single POST can
--   carry (and the old path buffered the whole ZIP in memory). The client now
--   uploads in ~8 MB chunks against an `import_uploads` session row; chunks
--   append to a staged .part file on the app server's disk. When complete, the
--   session is queued and a single in-process worker handles one upload at a
--   time: stream-extract → analyze (forensic_import_batches pipeline, reused)
--   → auto-commit (complaints created) — writing progress/stage/message here
--   so an SSE stream can push live updates. Sessions survive a browser close:
--   on return, 'uploading' rows resume from received_bytes (the client keeps
--   the file handle in IndexedDB), and queued/processing rows just keep going
--   server-side.
--
--   NOTE ON RE-RUNS: scripts/migrate.ts re-applies every file — everything
--   here must be idempotent.
-- -----------------------------------------------------------------------------

create table if not exists public.import_uploads (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'forensic_zip',
  file_name       text not null,
  file_size       bigint not null,
  -- Client fingerprint "name|size|lastModified" — matches a re-picked file to
  -- an interrupted session so the upload resumes instead of restarting.
  fingerprint     text not null,
  chunk_size      integer not null default 8388608,
  received_bytes  bigint not null default 0,
  staged_path     text,
  status          text not null default 'uploading'
                  check (status in ('uploading','queued','processing','review','done','failed','cancelled')),
  -- Human stage label while processing: Uploading / Waiting in queue /
  -- Extracting / Analyzing / Creating complaints / Done …
  stage           text,
  progress        integer not null default 0,   -- 0..100 across the WHOLE pipeline
  message         text,                          -- last live ticker line
  error           text,
  -- Rolling recent event log [{t, stage, msg}] (capped in code) so a client
  -- that reconnects can show what happened while it was away.
  events          jsonb not null default '[]'::jsonb,
  auto_commit     boolean not null default true,
  batch_id        uuid references public.forensic_import_batches (id) on delete set null,
  job_codes       text[],
  complaint_ids   uuid[],
  created_by      uuid references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index if not exists idx_import_uploads_user_status on public.import_uploads (created_by, status);
create index if not exists idx_import_uploads_user_created on public.import_uploads (created_by, created_at desc);
create index if not exists idx_import_uploads_queue on public.import_uploads (status, created_at);

drop trigger if exists set_import_uploads_updated on public.import_uploads;
create trigger set_import_uploads_updated before update on public.import_uploads
  for each row execute function public.set_updated_at();

comment on table public.import_uploads is
  'Chunked upload sessions + processing queue for forensic ZIP imports. staged_path is a LOCAL app-server file (never object storage); one worker processes queued rows FIFO and streams progress to the client over SSE.';
comment on column public.import_uploads.fingerprint is
  'Client-side file identity "name|size|lastModified"; used to resume an interrupted upload when the same file is re-selected (or restored from an IndexedDB file handle) on the same PC.';

notify pgrst, 'reload schema';
