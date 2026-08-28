-- =============================================================================
-- Custom fields engine ("+ Add a property") — whole-database, Notion-style.
--
-- A field_definition adds a field to EVERY record of an entity (task / customer
-- / spare_part). field_values stores each record's value for a field. The same
-- engine powers both user-added fields and the seeded preset fields.
-- =============================================================================

-- Entity a custom field can attach to.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'field_entity') then
    create type public.field_entity as enum ('task', 'customer', 'spare_part');
  end if;
  -- The deliberately small "practical core" set of field types.
  if not exists (select 1 from pg_type where typname = 'field_type') then
    create type public.field_type as enum (
      'text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url', 'files'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- field_definitions: the schema (one row per custom field per entity).
-- `options` holds choices for select / multi_select, e.g.
--   [{ "id": "opt_a", "label": "müşteride", "color": "amber" }, ...]
-- ---------------------------------------------------------------------------
create table if not exists public.field_definitions (
  id          uuid primary key default gen_random_uuid(),
  entity      public.field_entity not null,
  label       text not null,
  field_type  public.field_type not null,
  options     jsonb not null default '[]'::jsonb,
  position    double precision not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- field_values: one row per (field, record). `value` shape depends on type:
--   text/url  -> "..."          number -> 12.5         checkbox -> true
--   date      -> "2026-06-10"   select -> "opt_a"      multi_select -> ["opt_a","opt_b"]
--   files     -> ["path/1.jpg", "path/2.png"]  (paths in the `field-files` bucket)
-- record_id is the id of the task / customer / spare_part.
-- ---------------------------------------------------------------------------
create table if not exists public.field_values (
  id         uuid primary key default gen_random_uuid(),
  field_id   uuid not null references public.field_definitions (id) on delete cascade,
  record_id  uuid not null,
  value      jsonb,
  updated_at timestamptz not null default now(),
  unique (field_id, record_id)
);

create index if not exists field_definitions_entity_idx
  on public.field_definitions (entity, position);
create index if not exists field_values_record_idx
  on public.field_values (record_id);
create index if not exists field_values_field_idx
  on public.field_values (field_id);

-- ---------------------------------------------------------------------------
-- Ownership helper for field values: mirrors the parent entity's edit rules so
-- a task's assignee/creator can fill custom values on their own task, while
-- customer / spare_part values follow the shared can_edit_data() grant.
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_record(p_entity public.field_entity, p_record uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.can_edit_data() then
    return true;
  end if;
  if p_entity = 'task' then
    return exists (
      select 1 from public.tasks t
      where t.id = p_record
        and (t.assignee_id = auth.uid() or t.created_by = auth.uid())
    );
  end if;
  -- customer / spare_part: only head or granted editors (handled above).
  return false;
end;
$$;

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.field_definitions enable row level security;
alter table public.field_values      enable row level security;

-- Everyone authenticated can read the schema and values.
create policy "field_definitions read"
  on public.field_definitions for select to authenticated using (true);
create policy "field_values read"
  on public.field_values for select to authenticated using (true);

-- Managing the schema (add / rename / delete / reorder fields) = head or editors.
create policy "field_definitions write"
  on public.field_definitions for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());

-- Filling values follows the parent record's edit rules.
create policy "field_values write"
  on public.field_values for all to authenticated
  using (public.can_edit_record(
    (select fd.entity from public.field_definitions fd where fd.id = field_id),
    record_id))
  with check (public.can_edit_record(
    (select fd.entity from public.field_definitions fd where fd.id = field_id),
    record_id));

-- ===========================================================================
-- Storage: files-type field values
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('field-files', 'field-files', true)
on conflict (id) do nothing;

create policy "field files public read"
  on storage.objects for select
  using (bucket_id = 'field-files');

create policy "field files editor write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'field-files' and public.can_edit_data());

create policy "field files editor update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'field-files' and public.can_edit_data());

create policy "field files editor delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'field-files' and public.can_edit_data());
