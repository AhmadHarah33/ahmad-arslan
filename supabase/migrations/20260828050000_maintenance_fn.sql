-- On-demand preventive-maintenance generator. Runs as definer so any user
-- opening the dashboard can trigger due schedules; it is idempotent because it
-- advances next_due past today after creating each task.
create or replace function public.generate_due_maintenance()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  n int := 0;
  new_task uuid;
begin
  for s in
    select * from public.maintenance_schedules
    where active and next_due <= current_date
  loop
    insert into public.tasks (title, status, priority, customer_id, due_date, position, created_by)
    values (s.title, 'todo', 'medium', s.customer_id, s.next_due,
            extract(epoch from now()) * 1000, null)
    returning id into new_task;

    if s.assignee_id is not null then
      insert into public.task_assignees (task_id, profile_id)
      values (new_task, s.assignee_id)
      on conflict do nothing;
    end if;

    update public.maintenance_schedules
    set next_due = (next_due + make_interval(months => s.interval_months))::date,
        last_generated = current_date
    where id = s.id;

    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.generate_due_maintenance() to authenticated;
