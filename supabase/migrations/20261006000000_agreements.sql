-- =============================================================================
-- Bakım & Garanti: service agreements, their visits, and per-machine warranty.
--
-- * agreements          one per customer, covering one or more of their machines.
--                       plan 'periodic' = N visits per year, 'annual' = ONE visit
--                       (another visit the same year = a new agreement).
-- * agreement_machines  which customer_machines an agreement covers.
-- * agreement_visits    the scheduled visits. A visit becomes a normal task on the
--                       board shortly before its due date (generate_due_agreement_visits)
--                       and is marked done when that task is done.
-- * customer_machines.warranty_end   standard warranty end per machine.
--
-- "Expiring / Overdue / Unpaid" are derived in the agreement_overview view, never
-- stored. Replaces maintenance_schedules/generate_due_maintenance(): existing
-- schedules are converted below and deactivated (the old table is kept for rollback).
--
-- Rollback: 20261006000000_agreements_rollback.sql (next to this file).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.agreements (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.customers (id) on delete cascade,
  plan               text not null check (plan in ('periodic', 'annual')),
  visits_per_year    int  not null default 1 check (visits_per_year between 1 and 24),
  start_date         date not null,
  end_date           date not null,
  includes_warranty  boolean not null default false,
  warranty_end       date,
  amount             numeric(12,2),
  currency           text not null default 'TRY' check (currency in ('EUR', 'USD', 'TRY')),
  payment_status     text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  payment_due        date,
  paid_at            date,
  status             text not null default 'active' check (status in ('active', 'ended', 'cancelled')),
  assignee_id        uuid references public.profiles (id) on delete set null,
  notes              text not null default '',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint agreements_dates_ok check (end_date >= start_date),
  constraint agreements_annual_one_visit check (plan <> 'annual' or visits_per_year = 1),
  constraint agreements_warranty_date check (includes_warranty or warranty_end is null)
);

create index if not exists agreements_customer_idx on public.agreements (customer_id);
create index if not exists agreements_status_idx   on public.agreements (status);

create table if not exists public.agreement_machines (
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  machine_id   uuid not null references public.customer_machines (id) on delete cascade,
  primary key (agreement_id, machine_id)
);

create index if not exists agreement_machines_machine_idx on public.agreement_machines (machine_id);

create table if not exists public.agreement_visits (
  id           uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  seq          int  not null,
  due_date     date not null,
  task_id      uuid unique references public.tasks (id) on delete set null,
  done_at      date,
  unique (agreement_id, seq)
);

create index if not exists agreement_visits_due_idx on public.agreement_visits (due_date) where done_at is null;

alter table public.customer_machines
  add column if not exists warranty_end date;

-- ---------------------------------------------------------------------------
-- RLS: same open-write + audit pattern as customer_machines (agreements are
-- deliberately not behind the pending-approval gate).
-- ---------------------------------------------------------------------------
alter table public.agreements         enable row level security;
alter table public.agreement_machines enable row level security;
alter table public.agreement_visits   enable row level security;

create policy "agreements read" on public.agreements
  for select to authenticated using (true);
create policy "agreements all authenticated" on public.agreements
  for all to authenticated using (true) with check (true);

create policy "agreement_machines read" on public.agreement_machines
  for select to authenticated using (true);
create policy "agreement_machines all authenticated" on public.agreement_machines
  for all to authenticated using (true) with check (true);

create policy "agreement_visits read" on public.agreement_visits
  for select to authenticated using (true);
create policy "agreement_visits all authenticated" on public.agreement_visits
  for all to authenticated using (true) with check (true);

create trigger audit_agreements after insert or update or delete on public.agreements
  for each row execute function public.audit_row();
create trigger audit_agreement_visits after insert or update or delete on public.agreement_visits
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Visit generation: create the board task for every visit that is due within
-- the next 7 days (or overdue) and has no task yet. Idempotent: task_id is
-- stored on the visit, and the row is locked while it is processed.
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_agreement_visits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  new_task uuid;
  n int := 0;
  m record;
  names text;
begin
  for v in
    select av.id, av.seq, av.due_date, a.id as agreement_id, a.customer_id,
           a.assignee_id, a.visits_per_year, c.name as customer_name
    from public.agreement_visits av
    join public.agreements a on a.id = av.agreement_id
    join public.customers c  on c.id = a.customer_id
    where av.done_at is null
      and av.task_id is null
      and a.status = 'active'
      and av.due_date <= current_date + 7
    order by av.due_date
    for update of av skip locked
  loop
    -- First covered machine drives the task's city/brand/model.
    select cm.city_id, cm.company_id, cm.model_id into m
    from public.agreement_machines am
    join public.customer_machines cm on cm.id = am.machine_id
    where am.agreement_id = v.agreement_id
    order by cm.created_at
    limit 1;

    select string_agg(
             coalesce(nullif(cm.serial_number, ''), 'no serial'), ', ' order by cm.created_at)
      into names
    from public.agreement_machines am
    join public.customer_machines cm on cm.id = am.machine_id
    where am.agreement_id = v.agreement_id;

    insert into public.tasks (title, description, status, priority, customer_id, due_date,
                              position, created_by, city_id, company_id, model_id)
    values ('Bakım – ' || v.customer_name || ' (' || v.seq || '/' || v.visits_per_year || ')',
            'Scheduled maintenance visit ' || v.seq || '/' || v.visits_per_year
              || case when names is null then '' else E'\nMachines (SN): ' || names end,
            'todo', 'medium', v.customer_id, v.due_date,
            extract(epoch from now()) * 1000, null, m.city_id, m.company_id, m.model_id)
    returning id into new_task;

    if v.assignee_id is not null then
      insert into public.task_assignees (task_id, profile_id)
      values (new_task, v.assignee_id)
      on conflict do nothing;
    end if;

    update public.agreement_visits set task_id = new_task where id = v.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.generate_due_agreement_visits() to authenticated;

-- ---------------------------------------------------------------------------
-- Completion sync: task -> done marks the visit done; reopening clears it.
-- When every visit is done and the agreement period is over, it becomes 'ended'.
-- ---------------------------------------------------------------------------
create or replace function public.sync_agreement_visit_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement uuid;
begin
  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  if NEW.status = 'done' then
    update public.agreement_visits
       set done_at = current_date
     where task_id = NEW.id and done_at is null
    returning agreement_id into v_agreement;

    if v_agreement is not null then
      update public.agreements a
         set status = 'ended'
       where a.id = v_agreement
         and a.status = 'active'
         and a.end_date < current_date
         and not exists (select 1 from public.agreement_visits
                         where agreement_id = a.id and done_at is null);
    end if;
  elsif OLD.status = 'done' then
    update public.agreement_visits set done_at = null
     where task_id = NEW.id and done_at is not null
    returning agreement_id into v_agreement;

    if v_agreement is not null then
      update public.agreements set status = 'active'
       where id = v_agreement and status = 'ended';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists agreement_visit_sync on public.tasks;
create trigger agreement_visit_sync
  after update of status on public.tasks
  for each row execute function public.sync_agreement_visit_done();

-- ---------------------------------------------------------------------------
-- Derived view: everything the dashboard needs per agreement.
-- security_invoker so it follows the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace view public.agreement_overview
with (security_invoker = true) as
select
  a.*,
  c.name as customer_name,
  (select min(av.due_date) from public.agreement_visits av
     where av.agreement_id = a.id and av.done_at is null)                as next_visit,
  (select count(*) from public.agreement_visits av
     where av.agreement_id = a.id and av.done_at is not null)            as visits_done,
  (select count(*) from public.agreement_visits av
     where av.agreement_id = a.id)                                       as visits_total,
  exists (select 1 from public.agreement_visits av
            where av.agreement_id = a.id and av.done_at is null
              and av.due_date < current_date)                            as is_overdue,
  (a.status = 'active' and a.end_date <= current_date + 30)              as is_expiring,
  (a.payment_status = 'unpaid')                                          as is_unpaid,
  (a.payment_status = 'unpaid' and a.payment_due is not null
     and a.payment_due < current_date)                                   as payment_overdue
from public.agreements a
join public.customers c on c.id = a.customer_id;

grant select on public.agreement_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Convert existing maintenance schedules into periodic agreements (none exist
-- on the current database, but keep this for any other copy of the schema).
-- Visits per year = round(12 / interval); first visit = next_due.
-- ---------------------------------------------------------------------------
do $$
declare
  s record;
  new_agreement uuid;
  n int;
  i int;
begin
  for s in select * from public.maintenance_schedules where active loop
    n := greatest(1, least(24, round(12.0 / greatest(s.interval_months, 1))::int));

    insert into public.agreements (customer_id, plan, visits_per_year, start_date, end_date,
                                   assignee_id, notes)
    values (s.customer_id, 'periodic', n, s.next_due, (s.next_due + interval '1 year')::date,
            s.assignee_id, 'Migrated from maintenance schedule: ' || s.title)
    returning id into new_agreement;

    for i in 1..n loop
      insert into public.agreement_visits (agreement_id, seq, due_date)
      values (new_agreement, i,
              (s.next_due + make_interval(months => (i - 1) * greatest(s.interval_months, 1)))::date);
    end loop;

    update public.maintenance_schedules set active = false where id = s.id;
  end loop;
end $$;
