-- Cities and machine models as real lists instead of free text.
--
-- `customers.location` and `customers.machine` were plain text, so the same
-- city arrived spelled three ways and there was no way to offer "the models
-- this brand makes". This adds two catalog tables and links customers to
-- them, while keeping the original text columns as a denormalized mirror so
-- everything that already reads them — search, import/export, the print
-- sheet, service history — keeps working untouched.

create table if not exists public.cities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);
-- Case-insensitive uniqueness: "Izmir" and "izmir" are one city.
create unique index if not exists cities_name_key on public.cities (lower(name));

create table if not exists public.machine_models (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists machine_models_company_name_key
  on public.machine_models (company_id, lower(name));

alter table public.customers
  add column if not exists city_id  uuid references public.cities(id) on delete set null,
  add column if not exists model_id uuid references public.machine_models(id) on delete set null;

create index if not exists customers_city_id_idx  on public.customers (city_id);
create index if not exists customers_model_id_idx on public.customers (model_id);

alter table public.cities enable row level security;
alter table public.machine_models enable row level security;

drop policy if exists "cities all authenticated" on public.cities;
create policy "cities all authenticated" on public.cities
  for all to authenticated using (true) with check (true);

drop policy if exists "machine_models all authenticated" on public.machine_models;
create policy "machine_models all authenticated" on public.machine_models
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Gate: unchanged except for a transaction-local escape hatch, so that writes
-- the app makes to keep itself consistent — the backfill below, and the
-- rename propagation further down — aren't mistaken for an engineer editing
-- those customers and don't drop the whole list into pending review.
--
-- Defined here rather than at the end of the file because the backfill needs
-- it: a plain UPDATE over customers, run with no auth.uid(), fails
-- is_approver() and flags every row it touches.
-- ---------------------------------------------------------------------------
create or replace function public.gate_customer_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.skip_customer_gate', true), 'off') = 'on' then
    return NEW;
  end if;

  if public.is_approver() then
    NEW.is_approved := true;
    NEW.pending_action := null;
    NEW.pending_snapshot := null;
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    NEW.pending_action := 'insert';
    NEW.pending_snapshot := null;
  elsif OLD.is_approved then
    NEW.pending_action := 'update';
    NEW.pending_snapshot := to_jsonb(OLD)
      - 'is_approved' - 'pending_action' - 'pending_snapshot' - 'approved_by' - 'approved_at';
  else
    NEW.pending_action := OLD.pending_action;
    NEW.pending_snapshot := OLD.pending_snapshot;
  end if;
  NEW.is_approved := false;
  NEW.approved_by := null;
  NEW.approved_at := null;
  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill from what people already typed, so the lists start out useful.
-- Cities dedupe case-insensitively, so "ISTANBUL" and "İstanbul" collapse to
-- one entry and both customers end up spelled the same way.
-- ---------------------------------------------------------------------------
select set_config('app.skip_customer_gate', 'on', false);

insert into public.cities (name)
select distinct trim(location)
  from public.customers
 where coalesce(trim(location), '') <> ''
on conflict do nothing;

update public.customers c
   set city_id = ct.id
  from public.cities ct
 where lower(trim(c.location)) = lower(ct.name)
   and c.city_id is null;

-- A model belongs to a brand, so only customers that have one can be linked.
insert into public.machine_models (company_id, name)
select distinct c.company_id, trim(c.machine)
  from public.customers c
 where c.company_id is not null
   and coalesce(trim(c.machine), '') <> ''
on conflict do nothing;

update public.customers c
   set model_id = m.id
  from public.machine_models m
 where m.company_id = c.company_id
   and lower(trim(c.machine)) = lower(m.name)
   and c.model_id is null;

select set_config('app.skip_customer_gate', 'off', false);

-- ---------------------------------------------------------------------------
-- Keep the text mirror in step with the links.
-- ---------------------------------------------------------------------------
create or replace function public.sync_customer_catalog_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.city_id is not null then
    select name into NEW.location from public.cities where id = NEW.city_id;
  elsif TG_OP = 'UPDATE' and OLD.city_id is not null then
    -- Cleared on purpose. Only wipe the text when a link is actually being
    -- removed, so rows that only ever had text (a CSV import, anything from
    -- before this migration) keep it.
    NEW.location := '';
  end if;

  if NEW.model_id is not null then
    select name into NEW.machine from public.machine_models where id = NEW.model_id;
  elsif TG_OP = 'UPDATE' and OLD.model_id is not null then
    NEW.machine := '';
  end if;

  return NEW;
end;
$$;

-- Named to sort before customers_gate_upsert: Postgres fires BEFORE triggers
-- in name order, and the text should be settled before anything snapshots it.
drop trigger if exists a_customers_sync_catalog on public.customers;
create trigger a_customers_sync_catalog
  before insert or update on public.customers
  for each row execute function public.sync_customer_catalog_text();

-- ---------------------------------------------------------------------------
-- Renaming a catalog entry rewrites the mirror on every customer using it.
-- That write must not be mistaken for an engineer editing those customers, or
-- one rename would drop the whole list into pending review — hence the
-- transaction-local flag the gate checks below.
-- ---------------------------------------------------------------------------
create or replace function public.propagate_city_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.name is distinct from OLD.name then
    perform set_config('app.skip_customer_gate', 'on', true);
    update public.customers set location = NEW.name where city_id = NEW.id;
    perform set_config('app.skip_customer_gate', 'off', true);
  end if;
  return null;
end;
$$;

drop trigger if exists cities_propagate_rename on public.cities;
create trigger cities_propagate_rename
  after update on public.cities
  for each row execute function public.propagate_city_rename();

create or replace function public.propagate_model_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.name is distinct from OLD.name then
    perform set_config('app.skip_customer_gate', 'on', true);
    update public.customers set machine = NEW.name where model_id = NEW.id;
    perform set_config('app.skip_customer_gate', 'off', true);
  end if;
  return null;
end;
$$;

drop trigger if exists machine_models_propagate_rename on public.machine_models;
create trigger machine_models_propagate_rename
  after update on public.machine_models
  for each row execute function public.propagate_model_rename();

-- Rejecting an edit has to put the links back too, not just the text mirror,
-- or the row would show the old city name while still pointing at the new one.
create or replace function public.reject_customer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  act  text;
  snap jsonb;
begin
  if not public.is_approver() then
    raise exception 'Only the organizer or head engineer can review changes.';
  end if;
  select pending_action, pending_snapshot into act, snap
    from public.customers where id = p_id;

  if act = 'insert' then
    delete from public.customers where id = p_id;
    return;
  elsif act = 'delete' then
    update public.customers
      set pending_action = null, is_approved = true, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
    return;
  end if;

  update public.customers c set
    name           = coalesce(snap->>'name', c.name),
    location       = coalesce(snap->>'location', c.location),
    machine        = coalesce(snap->>'machine', c.machine),
    serial_number  = coalesce(snap->>'serial_number', c.serial_number),
    company_id     = nullif(snap->>'company_id', '')::uuid,
    city_id        = nullif(snap->>'city_id', '')::uuid,
    model_id       = nullif(snap->>'model_id', '')::uuid,
    contact_person = coalesce(snap->>'contact_person', c.contact_person),
    contact_info   = coalesce(snap->>'contact_info', c.contact_info),
    status         = coalesce(snap->>'status', c.status),
    is_approved = true, pending_action = null, pending_snapshot = null,
    approved_by = auth.uid(), approved_at = now()
  where c.id = p_id;
end;
$$;
