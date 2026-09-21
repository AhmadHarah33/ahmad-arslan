-- Parts cost and service charge had no currency attached. Add one selector
-- per task, shared by both amounts.
alter table public.tasks
  add column if not exists currency text not null default 'TRY'
    check (currency in ('EUR', 'USD', 'TRY'));
