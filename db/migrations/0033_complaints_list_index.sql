-- listComplaints() (lib/queries.ts) is the main /complaints list query: filters
-- deleted_at IS NULL then orders by updated_at DESC. The existing idx_complaints_deleted
-- (migration 0004) only covers the filter — Postgres still has to sort the whole
-- result set separately. A composite index lets it satisfy both the filter and the
-- sort directly.
create index if not exists idx_complaints_deleted_updated
  on public.complaints (deleted_at, updated_at desc);
