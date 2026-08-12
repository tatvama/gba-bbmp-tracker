-- -----------------------------------------------------------------------------
-- 0002_gba_wards — the GBA 369-ward structure (Annexures 1-5 of the
-- "5 City Corporation Division & Sub-Division Details" memo, 06-03-2026).
--
-- Unlike public.wards (the authoritative BBMP-225 list), this table holds the
-- NEW GBA per-corporation breakdown: corporation → division → sub-division →
-- ward. Names are romanised from the scanned Kannada source; ward_name_kn keeps
-- the original and `legible` flags names that were only partly legible.
-- -----------------------------------------------------------------------------
create table if not exists public.gba_wards (
  id                    uuid primary key default gen_random_uuid(),
  corporation_code      text not null
                        check (corporation_code in ('KENDRA','PURVA','PASHCHIMA','UTTARA','DAKSHINA')),
  annexure              text,
  division              text not null,
  assembly_constituency text,
  subdivision           text not null,
  ward_no               integer not null,
  ward_name_en          text not null,
  ward_name_kn          text,
  legible               boolean not null default true,
  created_at            timestamptz not null default now(),
  unique (corporation_code, ward_no)
);

create index if not exists gba_wards_corp_idx on public.gba_wards (corporation_code);
create index if not exists gba_wards_division_idx on public.gba_wards (corporation_code, division);

-- RLS: public read; role-gated writes (same model as the civic tables).
alter table public.gba_wards enable row level security;

drop policy if exists "gba_wards_read" on public.gba_wards;
create policy "gba_wards_read" on public.gba_wards for select using (true);

drop policy if exists "gba_wards_insert" on public.gba_wards;
create policy "gba_wards_insert" on public.gba_wards for insert with check (public.can_write());

drop policy if exists "gba_wards_update" on public.gba_wards;
create policy "gba_wards_update" on public.gba_wards for update using (public.can_verify()) with check (public.can_verify());

drop policy if exists "gba_wards_delete" on public.gba_wards;
create policy "gba_wards_delete" on public.gba_wards for delete using (public.is_admin());
