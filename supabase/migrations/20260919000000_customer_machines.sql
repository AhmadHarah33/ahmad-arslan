-- =============================================================================
-- Customers move from "one city/brand/model/serial" to a list of machines.
-- A customer can own several units (different brands, different cities even),
-- so the old scalar columns on `customers` become a child table instead.
--
-- To avoid rewriting every place that already reads customers.location /
-- customers.machine / customers.serial_number / customers.city_id /
-- customers.company_id / customers.model_id (search, the print sheet,
-- CSV export, the customers table, the brand filter), those columns stay —
-- they now mirror the customer's *primary* machine (the earliest one added),
-- kept in sync by a trigger below, the same way the catalog migration already
-- mirrors city_id/model_id into location/machine text.
--
-- Machine edits go through the same pending-approval gate as the rest of a
-- customer's data: a non-approver's insert/update/delete lands pending
-- review instead of taking effect immediately, mirroring gate_customer_upsert
-- / gate_customer_delete.
-- =============================================================================

create table if not exists public.customer_machines (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references public.customers (id) on delete cascade,
  city_id           uuid references public.cities (id) on delete set null,
  company_id        uuid references public.companies (id) on delete set null,
  model_id          uuid references public.machine_models (id) on delete set null,
  serial_number     text not null default '',
  is_approved       boolean not null default true,
  pending_action    text check (pending_action in ('insert', 'update', 'delete')),
  pending_snapshot  jsonb,
  approved_by       uuid references public.profiles (id) on delete set null,
  approved_at       timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists customer_machines_customer_idx on public.customer_machines (customer_id);
create index if not exists customer_machines_pending_idx on public.customer_machines (is_approved) where is_approved = false;

alter table public.customer_machines enable row level security;

create policy "customer_machines read" on public.customer_machines
  for select to authenticated using (true);
-- Open write RLS: the gate triggers below are the real control, same as
-- customers/spare_parts.
create policy "customer_machines all authenticated" on public.customer_machines
  for all to authenticated using (true) with check (true);

create trigger audit_customer_machines after insert or update or delete on public.customer_machines
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Backfill one machine per customer from what's already on the row, so
-- existing data isn't lost.
-- ---------------------------------------------------------------------------
insert into public.customer_machines (customer_id, city_id, company_id, model_id, serial_number, created_by, created_at)
select id, city_id, company_id, model_id, serial_number, created_by, created_at
  from public.customers
 where city_id is not null
    or company_id is not null
    or model_id is not null
    or coalesce(trim(serial_number), '') <> '';

-- ---------------------------------------------------------------------------
-- Mirror the primary (earliest) machine back onto the customer row. Runs
-- with the same transaction-local escape hatch the catalog migration uses,
-- so this bookkeeping write isn't mistaken for an engineer editing the
-- customer and doesn't drop it into pending review.
-- ---------------------------------------------------------------------------
create or replace function public.sync_customer_primary_machine(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  select city_id, company_id, model_id, serial_number into m
    from public.customer_machines
   where customer_id = p_customer_id
   order by created_at asc
   limit 1;

  perform set_config('app.skip_customer_gate', 'on', true);
  if m is null then
    update public.customers
       set city_id = null, company_id = null, model_id = null, serial_number = ''
     where id = p_customer_id;
  else
    update public.customers
       set city_id = m.city_id, company_id = m.company_id, model_id = m.model_id,
           serial_number = coalesce(m.serial_number, '')
     where id = p_customer_id;
  end if;
  perform set_config('app.skip_customer_gate', 'off', true);
end;
$$;

create or replace function public.sync_customer_primary_machine_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    perform public.sync_customer_primary_machine(OLD.customer_id);
    return OLD;
  end if;
  perform public.sync_customer_primary_machine(NEW.customer_id);
  if TG_OP = 'UPDATE' and OLD.customer_id is distinct from NEW.customer_id then
    perform public.sync_customer_primary_machine(OLD.customer_id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists z_customer_machines_sync_primary on public.customer_machines;
create trigger z_customer_machines_sync_primary
  after insert or update or delete on public.customer_machines
  for each row execute function public.sync_customer_primary_machine_trigger();

-- Backfill above bypassed the trigger's insert path only in the sense that it
-- ran before the customer's own mirror columns needed touching (they already
-- held the same values) — run it once now so future edits have a clean base.
do $$
declare c record;
begin
  for c in select distinct customer_id from public.customer_machines loop
    perform public.sync_customer_primary_machine(c.customer_id);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- Approval gate — same shape as gate_customer_upsert / gate_customer_delete.
-- ---------------------------------------------------------------------------
create or replace function public.gate_customer_machine_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists customer_machines_gate_upsert on public.customer_machines;
create trigger customer_machines_gate_upsert
  before insert or update on public.customer_machines
  for each row execute function public.gate_customer_machine_upsert();

create or replace function public.gate_customer_machine_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_approver() or OLD.pending_action = 'insert' then
    return OLD;
  end if;
  update public.customer_machines
    set pending_action = 'delete', is_approved = false, approved_by = null, approved_at = null
    where id = OLD.id;
  return null; -- cancel the actual delete
end;
$$;

drop trigger if exists customer_machines_gate_delete on public.customer_machines;
create trigger customer_machines_gate_delete
  before delete on public.customer_machines
  for each row execute function public.gate_customer_machine_delete();

create or replace function public.approve_customer_machine(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approver() then
    raise exception 'Only the organizer or head engineer can approve changes.';
  end if;
  if (select pending_action from public.customer_machines where id = p_id) = 'delete' then
    delete from public.customer_machines where id = p_id;
    return;
  end if;
  update public.customer_machines
    set is_approved = true, pending_action = null, pending_snapshot = null,
        approved_by = auth.uid(), approved_at = now()
    where id = p_id;
end;
$$;

create or replace function public.reject_customer_machine(p_id uuid)
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
    from public.customer_machines where id = p_id;

  if act = 'insert' then
    delete from public.customer_machines where id = p_id;
    return;
  elsif act = 'delete' then
    update public.customer_machines
      set pending_action = null, is_approved = true, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
    return;
  end if;

  update public.customer_machines cm set
    city_id       = nullif(snap->>'city_id', '')::uuid,
    company_id    = nullif(snap->>'company_id', '')::uuid,
    model_id      = nullif(snap->>'model_id', '')::uuid,
    serial_number = coalesce(snap->>'serial_number', cm.serial_number),
    is_approved = true, pending_action = null, pending_snapshot = null,
    approved_by = auth.uid(), approved_at = now()
  where cm.id = p_id;
end;
$$;

-- =============================================================================
-- Spare parts on a task: a custom price per line instead of always the
-- catalog price, so a job can be priced differently from what's on the shelf
-- (a discount, a bundle, an old part billed at its old price). The catalog
-- price is still used as the starting suggestion when a part is picked.
-- =============================================================================
alter table public.task_parts
  add column if not exists unit_price numeric(12, 2);

update public.task_parts tp
   set unit_price = sp.price
  from public.spare_parts sp
 where tp.spare_part_id = sp.id
   and tp.unit_price is null;

-- =============================================================================
-- One assignee can be flagged the lead/responsible engineer on a task —
-- shown first and used on the printed report. At most one lead per task.
-- =============================================================================
alter table public.task_assignees
  add column if not exists is_lead boolean not null default false;

-- task_assignees previously only needed insert/delete policies (rows were
-- never updated in place) — is_lead is the first field ever changed on an
-- existing row, and without an UPDATE policy RLS silently blocks it (0 rows
-- affected, no error). Same "fully open" rule as the rest of task_assignees.
drop policy if exists "task_assignees update" on public.task_assignees;
create policy "task_assignees update"
  on public.task_assignees for update
  to authenticated
  using (true)
  with check (true);

create or replace function public.enforce_single_task_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.is_lead then
    update public.task_assignees
       set is_lead = false
     where task_id = NEW.task_id and profile_id <> NEW.profile_id and is_lead;
  end if;
  return NEW;
end;
$$;

drop trigger if exists task_assignees_single_lead on public.task_assignees;
create trigger task_assignees_single_lead
  before insert or update on public.task_assignees
  for each row execute function public.enforce_single_task_lead();
