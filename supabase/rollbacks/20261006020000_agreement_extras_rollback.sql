-- Manual rollback for 20261006020000_agreement_extras.sql (kept outside migrations/ on purpose).
-- Refuses to run if warranty-only agreements or drafts exist, since the old schema can't hold them.
do $$ begin
  if exists (select 1 from public.agreements where plan = 'warranty' or status = 'draft') then
    raise exception 'Delete or convert warranty-only agreements and drafts before rolling back.';
  end if;
end $$;

drop view if exists public.agreement_overview;
drop table if exists public.agreement_assignees;

alter table public.agreements
  drop constraint if exists agreements_plan_check,
  drop constraint if exists agreements_status_check,
  drop constraint if exists agreements_visits_by_plan,
  drop constraint if exists agreements_coverage_check,
  drop constraint if exists agreements_months_check,
  drop constraint if exists agreements_remind_check,
  drop constraint if exists agreements_warranty_date,
  drop column if exists coverage,
  drop column if exists warranty_months,
  drop column if exists remind_days,
  drop column if exists contract_path;

alter table public.agreements
  add constraint agreements_plan_check check (plan in ('periodic', 'annual')),
  add constraint agreements_status_check check (status in ('active', 'ended', 'cancelled')),
  add constraint agreements_visits_per_year_check check (visits_per_year between 1 and 24),
  add constraint agreements_annual_one_visit check (plan <> 'annual' or visits_per_year = 1),
  add constraint agreements_warranty_date check (includes_warranty or warranty_end is null);

drop policy if exists "agreement contracts read"   on storage.objects;
drop policy if exists "agreement contracts write"  on storage.objects;
drop policy if exists "agreement contracts update" on storage.objects;
drop policy if exists "agreement contracts delete" on storage.objects;
-- The agreement-contracts bucket is NOT deleted here (it may hold files); empty and remove it from Studio.

-- Step-1 versions of the generator and the view:
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
