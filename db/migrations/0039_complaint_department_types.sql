-- -----------------------------------------------------------------------------
-- 0039 — Replace the complaint TYPE vocabulary with the BBMP department taxonomy.
--
-- The old free-form civic types (Road, Drain, Garbage, Tender Irregularity, …)
-- are replaced by the responsible BBMP department. The forensic ZIP importer and
-- the letter-intake AI now CLASSIFY each complaint into one of these departments
-- instead of hardcoding "Tender Irregularity".
--
-- ORDER MATTERS: the OLD constraint (mig 0004, only the 18 legacy values) must be
-- dropped BEFORE remapping, because the remap writes NEW values (e.g. "Road" ->
-- "Road Infrastructure") that the old constraint would reject as "new row
-- violates check constraint" on any row still holding a legacy value. Only after
-- every row is guaranteed to hold a new-taxonomy value does the new constraint
-- get added. Idempotent: re-running remaps nothing (rows already hold new
-- values) and re-asserts the same constraint.
-- -----------------------------------------------------------------------------

-- 1) Drop the OLD constraint FIRST so the remap below can freely write new values.
alter table public.complaints drop constraint if exists complaints_type_check;

-- 2) Map every legacy type value → nearest new department.
update public.complaints set type = case type
  when 'Road' then 'Road Infrastructure'
  when 'Footpath' then 'Road Infrastructure'
  when 'Public Works' then 'Road Infrastructure'
  when 'Drain' then 'Storm Water Drain'
  when 'Water Logging' then 'Storm Water Drain'
  when 'Streetlight' then 'Electrical'
  when 'Park' then 'Horticulture'
  when 'Garbage' then 'Health'
  when 'Health Issue' then 'Health'
  when 'Encroachment' then 'Town Planning'
  when 'Building Violation' then 'Town Planning'
  when 'Bill Payment' then 'Revenue'
  when 'Revenue Issue' then 'Revenue'
  when 'Tender Irregularity' then 'Other'
  when 'Contractor Issue' then 'Other'
  when 'Engineer Non Response' then 'Other'
  when 'Ward Office Issue' then 'Other'
  else type end
where type in (
  'Road','Footpath','Public Works','Drain','Water Logging','Streetlight',
  'Park','Garbage','Health Issue','Encroachment','Building Violation',
  'Bill Payment','Revenue Issue','Tender Irregularity','Contractor Issue',
  'Engineer Non Response','Ward Office Issue'
);

-- 3) Safety net: any non-null value NOT already in the new set (unexpected legacy
--    data) falls back to 'Other', so the new constraint can never fail to attach.
update public.complaints set type = 'Other'
where type is not null and type not in (
  'Road Infrastructure','Storm Water Drain','Lakes','Electrical','Horticulture',
  'Town Planning','Revenue','Health','Legal','IT','Other');

-- 4) Add the new CHECK constraint (every row now guaranteed to satisfy it).
alter table public.complaints add constraint complaints_type_check check (type in (
  'Road Infrastructure','Storm Water Drain','Lakes','Electrical','Horticulture',
  'Town Planning','Revenue','Health','Legal','IT','Other'));
