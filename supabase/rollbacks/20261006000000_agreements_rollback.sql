-- Manual rollback for 20261006000000_agreements.sql. Lives outside migrations/ on purpose
-- Re-activates schedules that were converted, then drops everything the migration added.
update public.maintenance_schedules set active = true
 where customer_id in (
   select customer_id from public.agreements where notes like 'Migrated from maintenance schedule:%');

drop trigger  if exists agreement_visit_sync on public.tasks;
drop function if exists public.sync_agreement_visit_done();
drop function if exists public.generate_due_agreement_visits();
drop view     if exists public.agreement_overview;
drop table    if exists public.agreement_visits;
drop table    if exists public.agreement_machines;
drop table    if exists public.agreements;
alter table public.customer_machines drop column if exists warranty_end;
