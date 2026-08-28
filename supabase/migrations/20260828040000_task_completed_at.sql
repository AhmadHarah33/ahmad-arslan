-- Track when a task was completed (for "done this week" / velocity metrics).
alter table public.tasks add column if not exists completed_at timestamptz;

create or replace function public.set_task_completed()
returns trigger language plpgsql as $$
begin
  if NEW.status = 'done'
     and (TG_OP = 'INSERT' or OLD.status is distinct from 'done') then
    NEW.completed_at := now();
  elsif NEW.status <> 'done' then
    NEW.completed_at := null;
  end if;
  return NEW;
end; $$;

drop trigger if exists task_completed on public.tasks;
create trigger task_completed
  before insert or update on public.tasks
  for each row execute function public.set_task_completed();

-- Backfill existing done tasks so metrics have data.
update public.tasks set completed_at = coalesce(completed_at, created_at)
where status = 'done' and completed_at is null;
