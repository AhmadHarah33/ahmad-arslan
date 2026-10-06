-- =============================================================================
-- New Agreement form: what the design needs beyond the first agreements schema.
--
--  * plan 'warranty'      warranty extension only: no visits, just coverage + payment
--  * status 'draft'       saved but not live: its visits exist (so edited dates are kept)
--                         but no board tasks are generated until it is activated
--  * coverage / months    what the extended warranty covers and for how long
--  * remind_days          how many days before a visit its board task appears (3/7/14)
--  * several technicians  agreement_assignees; assignee_id stays as the lead
--  * contract_path        signed contract PDF in the private agreement-contracts bucket
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------
alter table public.agreements
  drop constraint if exists agreements_plan_check,
  drop constraint if exists agreements_status_check,
  drop constraint if exists agreements_visits_per_year_check,
  drop constraint if exists agreements_annual_one_visit,
  drop constraint if exists agreements_warranty_date;

alter table public.agreements
  add column if not exists coverage       text,
  add column if not exists warranty_months int,
  add column if not exists remind_days    int not null default 7,
  add column if not exists contract_path  text;

alter table public.agreements
  add constraint agreements_plan_check
    check (plan in ('periodic', 'annual', 'warranty')),
  add constraint agreements_status_check
    check (status in ('draft', 'active', 'ended', 'cancelled')),
  -- visits: periodic 1-24, annual exactly 1, warranty-only none
  add constraint agreements_visits_by_plan check (
    (plan = 'periodic' and visits_per_year between 1 and 24)
    or (plan = 'annual' and visits_per_year = 1)
    or (plan = 'warranty' and visits_per_year = 0)
  ),
  add constraint agreements_coverage_check
    check (coverage is null or coverage in ('parts_labour', 'labour', 'parts')),
  add constraint agreements_months_check
    check (warranty_months is null or warranty_months between 1 and 120),
  add constraint agreements_remind_check
    check (remind_days in (3, 7, 14)),
  add constraint agreements_warranty_date check (
    (includes_warranty or warranty_end is null)
    -- a live warranty-only agreement must say until when
    and (plan <> 'warranty' or status = 'draft' or (includes_warranty and warranty_end is not null))
  );

-- ---------------------------------------------------------------------------
-- Technicians
-- ---------------------------------------------------------------------------
create table if not exists public.agreement_assignees (
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  primary key (agreement_id, profile_id)
);

create index if not exists agreement_assignees_profile_idx
  on public.agreement_assignees (profile_id);

alter table public.agreement_assignees enable row level security;
create policy "agreement_assignees read" on public.agreement_assignees
  for select to authenticated using (true);
create policy "agreement_assignees all authenticated" on public.agreement_assignees
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Visit generation: per-agreement lead time, every technician assigned, the
-- agreement's lead (assignee_id) flagged as lead on the task.
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
      and av.due_date <= current_date + a.remind_days
    order by av.due_date
    for update of av skip locked
  loop
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

    insert into public.task_assignees (task_id, profile_id)
    select new_task, p
      from (select profile_id as p from public.agreement_assignees
             where agreement_id = v.agreement_id
            union
            select v.assignee_id where v.assignee_id is not null) s
    on conflict do nothing;

    if v.assignee_id is not null then
      update public.task_assignees set is_lead = true
       where task_id = new_task and profile_id = v.assignee_id;
    end if;

    update public.agreement_visits set task_id = new_task where id = v.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Overview view: drafts and cancelled agreements never count as overdue.
-- Recreated (not replaced) because a.* now has more columns.
-- ---------------------------------------------------------------------------
drop view if exists public.agreement_overview;
create view public.agreement_overview
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
  (a.status = 'active' and exists (
     select 1 from public.agreement_visits av
      where av.agreement_id = a.id and av.done_at is null
        and av.due_date < current_date))                                 as is_overdue,
  (a.status = 'active' and a.end_date <= current_date + 30)              as is_expiring,
  (a.status in ('active', 'ended') and a.payment_status = 'unpaid')      as is_unpaid,
  (a.status in ('active', 'ended') and a.payment_status = 'unpaid'
     and a.payment_due is not null and a.payment_due < current_date)     as payment_overdue
from public.agreements a
join public.customers c on c.id = a.customer_id;

grant select on public.agreement_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Signed contracts: private bucket (contracts are not for public URLs).
-- Anyone signed in can read via a signed URL; editors write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agreement-contracts', 'agreement-contracts', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "agreement contracts read"
  on storage.objects for select to authenticated
  using (bucket_id = 'agreement-contracts');

create policy "agreement contracts write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'agreement-contracts' and public.can_edit_data());

create policy "agreement contracts update"
  on storage.objects for update to authenticated
  using (bucket_id = 'agreement-contracts' and public.can_edit_data());

create policy "agreement contracts delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'agreement-contracts' and public.can_edit_data());
