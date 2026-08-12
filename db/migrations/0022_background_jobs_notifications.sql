-- Background jobs + in-app notifications.
-- background_jobs: long-running/automated work (AI drafts, imports, OCR, scans)
--   tracked so the client can show a live "running" indicator and pick the
--   result up after navigating away. notifications: an in-app alerts inbox that
--   every finished/automated job drops a message into.

create table if not exists public.background_jobs (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                       -- ai_draft | forensic_import | ocr | vision | photo_scan | letter_gen | ...
  status      text not null default 'queued'
              check (status in ('queued','running','done','failed')),
  title       text,                                -- human label, e.g. "Counter-reply · DM-CMP-2026-000017"
  entity_type text,                                -- complaint | job | rti | ...
  entity_id   uuid,
  progress    int,                                 -- 0..100, optional
  input       jsonb,                               -- job params
  result      jsonb,                               -- output (e.g. { text })
  error       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_bg_jobs_user_status on public.background_jobs (created_by, status);
create index if not exists idx_bg_jobs_created on public.background_jobs (created_at desc);

drop trigger if exists set_bg_jobs_updated on public.background_jobs;
create trigger set_bg_jobs_updated before update on public.background_jobs
  for each row execute function public.set_updated_at();

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete cascade,
  type        text not null default 'info',        -- job_done | job_failed | overdue | info
  title       text not null,
  body        text,
  link        text,                                -- in-app path to open, e.g. /complaints/<id>?tab=ai
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications (user_id, read_at, created_at desc);

comment on table public.background_jobs is 'Async/automated work tracked for a live progress indicator + result pickup after navigation.';
comment on table public.notifications is 'In-app alerts inbox; every finished/automated job drops a message here.';

notify pgrst, 'reload schema';
