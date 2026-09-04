-- A task can only be marked done once it actually records what was done:
-- a title, a description, and both TEŞHİS (diagnosis) and ÇÖZÜM (solution).
-- Rapor stays optional — a missing report is flagged with a dot on the card
-- instead of blocking completion.
--
-- Enforced here rather than only in the form because there are three ways to
-- complete a task — the modal, dragging the card, and the mobile "Move to…"
-- sheet — and a rule that lives in one of them is not a rule.

-- Returns the labels of the required custom fields that are still empty, or
-- null when nothing is missing.
create or replace function public.task_missing_required_fields(p_task uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(fd.label, ', ' order by fd.position)
    from public.field_definitions fd
    left join public.field_values fv
           on fv.field_id = fd.id and fv.record_id = p_task
   where fd.entity = 'task'
     and fd.label in ('TEŞHİS', 'ÇÖZÜM')
     and coalesce(btrim(trim(both '"' from fv.value::text)), '') = '';
$$;

create or replace function public.set_task_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_parts boolean;
  missing   text;
begin
  if NEW.status = 'done' then
    -- Only gate the transition *into* done. Re-saving a task that was already
    -- approved, and a manager approving one out of pending_approval, have
    -- both already passed this check.
    if TG_OP = 'INSERT' or OLD.status not in ('done', 'pending_approval') then
      if coalesce(btrim(NEW.title), '') = '' then
        raise exception 'Add a title before marking this task done.';
      end if;
      if coalesce(btrim(NEW.description), '') = '' then
        raise exception 'Add a description before marking this task done.';
      end if;
      missing := public.task_missing_required_fields(NEW.id);
      if missing is not null then
        raise exception 'Fill in % before marking this task done.', missing;
      end if;
    end if;

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
        -- Already done and already approved; stock was deducted once.
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
