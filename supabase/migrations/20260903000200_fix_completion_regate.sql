-- Fix: re-saving an already-completed, parts-attached task (status already
-- 'done') was being bounced back to 'pending_approval' by set_task_completed,
-- because the redirect branch only checked "did this UPDATE come from
-- pending_approval", not "is it already done". Any no-op-looking save of a
-- finished task — reopening the modal and clicking Save with nothing
-- changed, a stray re-drag, editing the title later — re-triggered the
-- approval gate. Worse: approving it a second time would deduct stock a
-- second time, since the deduction branch only checks OLD.status =
-- 'pending_approval' and does not know it already ran once for this task.
--
-- Found via a direct-API security check (confirming an engineer cannot force
-- a pending_approval task to done): the same PATCH also demonstrated the
-- done -> pending_approval regression on an already-approved row.
create or replace function public.set_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_parts boolean;
begin
  if NEW.status = 'done' then
    has_parts := exists (select 1 from public.task_parts where task_id = NEW.id);

    if has_parts then
      if TG_OP = 'UPDATE' and OLD.status = 'pending_approval' then
        -- This is the approval step itself.
        if not public.is_approver() then
          raise exception 'Only the organizer or head engineer can approve a completed task.';
        end if;
        update public.spare_parts sp
          set quantity = sp.quantity - agg.qty
          from (
            select spare_part_id, sum(quantity) as qty
            from public.task_parts
            where task_id = NEW.id
            group by spare_part_id
          ) agg
          where sp.id = agg.spare_part_id;
        NEW.completed_at := coalesce(NEW.completed_at, now());
      elsif TG_OP = 'UPDATE' and OLD.status = 'done' then
        -- Already done and already approved (stock already deducted once).
        -- A later save that still says 'done' — editing another field,
        -- reopening and re-saving, a stray re-drag — must not re-run the
        -- gate or deduct stock again.
        NEW.completed_at := coalesce(NEW.completed_at, OLD.completed_at, now());
      else
        -- First time this task is marked done with parts attached: hold for
        -- approval instead of completing outright, whoever the actor is.
        NEW.status := 'pending_approval';
        NEW.completed_at := null;
      end if;
    else
      NEW.completed_at := coalesce(NEW.completed_at, now());
    end if;
  elsif NEW.status <> 'done' then
    NEW.completed_at := null;
  end if;
  return NEW;
end;
$$;
