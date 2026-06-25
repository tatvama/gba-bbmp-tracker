-- Alter rti_applications to support GBA ward structure matching complaints
alter table public.rti_applications add column if not exists ward_type text not null default 'BBMP' check (ward_type in ('BBMP', 'GBA'));
alter table public.rti_applications add column if not exists gba_ward_id uuid references public.gba_wards (id) on delete set null;
alter table public.rti_applications add column if not exists gba_division text;
alter table public.rti_applications add column if not exists gba_subdivision text;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
