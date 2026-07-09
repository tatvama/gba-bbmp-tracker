-- Alter complaints to support GBA ward structure matching RTI applications
alter table public.complaints add column if not exists ward_type text not null default 'BBMP' check (ward_type in ('BBMP', 'GBA'));
alter table public.complaints add column if not exists gba_ward_id uuid;
alter table public.complaints add column if not exists gba_division text;
alter table public.complaints add column if not exists gba_subdivision text;

-- Add foreign key constraint if not exists
alter table public.complaints drop constraint if exists complaints_gba_ward_id_fkey;
alter table public.complaints add constraint complaints_gba_ward_id_fkey foreign key (gba_ward_id) references public.gba_wards (id) on delete set null;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
