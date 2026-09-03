-- =============================================================================
-- Approval workflow, part 2: functions, triggers and RLS that reference the
-- columns/enum value added in the previous migration.
--
-- Role model addition:
--   Tasks are now fully open — any authenticated user edits any field on any
--   task and assigns/unassigns anyone. The one carve-out is completing a task
--   that consumed spare parts: that transition is gated to head/organizer,
--   enforced in the trigger below (not just in the UI), because RLS alone
--   can't tell "set status to done" apart from any other update.
--
--   Customers and spare parts are similarly open to insert/update/delete for
--   any authenticated user. A change made by someone who is not head/organizer
--   is visible immediately (single source of truth, no shadow copy) but is
--   flagged `is_approved = false` until reviewed; a delete by a non-manager
--   does not actually delete — it flags the row `pending_action = 'delete'`
--   and the row stays exactly as it was until reviewed.
-- =============================================================================

create or replace function public.is_approver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_tasks(); -- head or organizer
$$;

-- ---------------------------------------------------------------------------
-- Task completion gate + stock deduction.
-- ---------------------------------------------------------------------------
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

-- Stock used to be deducted the moment a part was attached to a task
-- (regardless of whether the task was ever finished). It is now deducted only
-- when a parts-attached task is approved, above.
drop trigger if exists task_parts_usage on public.task_parts;
drop function if exists public.apply_part_usage();

-- ---------------------------------------------------------------------------
-- Tasks: fully open. Reassigning/editing anything is a plain update; the
-- pending_approval carve-out above is enforced regardless of these policies.
-- ---------------------------------------------------------------------------
drop policy if exists "tasks read" on public.tasks;
drop policy if exists "tasks manager all" on public.tasks;
drop policy if exists "tasks engineer insert" on public.tasks;
drop policy if exists "tasks engineer update" on public.tasks;
drop policy if exists "tasks engineer delete" on public.tasks;

create policy "tasks all authenticated"
  on public.tasks for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "task_assignees insert" on public.task_assignees;
create policy "task_assignees insert"
  on public.task_assignees for insert
  to authenticated
  with check (true);

drop policy if exists "task_assignees delete" on public.task_assignees;
create policy "task_assignees delete"
  on public.task_assignees for delete
  to authenticated
  using (true);

-- Custom fields on tasks, and task_parts (which reuses can_edit_record('task',
-- ...)), follow the same "everyone" rule.
create or replace function public.can_edit_record(p_entity public.field_entity, p_record uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.can_edit_data() then
    return true;
  end if;
  if p_entity = 'task' then
    return true;
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve/reject gates for customers.
-- ---------------------------------------------------------------------------
create or replace function public.gate_customer_upsert()
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
    -- First unreviewed edit since the last approval: snapshot the approved
    -- state so a reject can restore it.
    NEW.pending_action := 'update';
    NEW.pending_snapshot := to_jsonb(OLD)
      - 'is_approved' - 'pending_action' - 'pending_snapshot' - 'approved_by' - 'approved_at';
  else
    -- Already pending from an earlier edit: keep chasing the same review
    -- item rather than overwriting the snapshot of the last approved state.
    NEW.pending_action := OLD.pending_action;
    NEW.pending_snapshot := OLD.pending_snapshot;
  end if;
  NEW.is_approved := false;
  NEW.approved_by := null;
  NEW.approved_at := null;
  return NEW;
end;
$$;

drop trigger if exists customers_gate_upsert on public.customers;
create trigger customers_gate_upsert
  before insert or update on public.customers
  for each row execute function public.gate_customer_upsert();

create or replace function public.gate_customer_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Managers delete outright. So does anyone retracting their own row that
  -- was never approved in the first place — nothing to review yet.
  if public.is_approver() or OLD.pending_action = 'insert' then
    return OLD;
  end if;
  update public.customers
    set pending_action = 'delete', is_approved = false, approved_by = null, approved_at = null
    where id = OLD.id;
  return null; -- cancel the actual delete
end;
$$;

drop trigger if exists customers_gate_delete on public.customers;
create trigger customers_gate_delete
  before delete on public.customers
  for each row execute function public.gate_customer_delete();

create or replace function public.approve_customer(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approver() then
    raise exception 'Only the organizer or head engineer can approve changes.';
  end if;
  if (select pending_action from public.customers where id = p_id) = 'delete' then
    delete from public.customers where id = p_id;
    return;
  end if;
  update public.customers
    set is_approved = true, pending_action = null, pending_snapshot = null,
        approved_by = auth.uid(), approved_at = now()
    where id = p_id;
end;
$$;

create or replace function public.reject_customer(p_id uuid)
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
    from public.customers where id = p_id;

  if act = 'insert' then
    delete from public.customers where id = p_id;
    return;
  elsif act = 'delete' then
    update public.customers
      set pending_action = null, is_approved = true, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
    return;
  end if;

  update public.customers c set
    name           = coalesce(snap->>'name', c.name),
    location       = coalesce(snap->>'location', c.location),
    machine        = coalesce(snap->>'machine', c.machine),
    serial_number  = coalesce(snap->>'serial_number', c.serial_number),
    company_id     = nullif(snap->>'company_id', '')::uuid,
    contact_person = coalesce(snap->>'contact_person', c.contact_person),
    contact_info   = coalesce(snap->>'contact_info', c.contact_info),
    status         = coalesce(snap->>'status', c.status),
    is_approved = true, pending_action = null, pending_snapshot = null,
    approved_by = auth.uid(), approved_at = now()
  where c.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve/reject gates for spare parts. Same shape as customers.
-- ---------------------------------------------------------------------------
create or replace function public.gate_spare_part_upsert()
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

drop trigger if exists spare_parts_gate_upsert on public.spare_parts;
create trigger spare_parts_gate_upsert
  before insert or update on public.spare_parts
  for each row execute function public.gate_spare_part_upsert();

create or replace function public.gate_spare_part_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_approver() or OLD.pending_action = 'insert' then
    return OLD;
  end if;
  update public.spare_parts
    set pending_action = 'delete', is_approved = false, approved_by = null, approved_at = null
    where id = OLD.id;
  return null;
end;
$$;

drop trigger if exists spare_parts_gate_delete on public.spare_parts;
create trigger spare_parts_gate_delete
  before delete on public.spare_parts
  for each row execute function public.gate_spare_part_delete();

create or replace function public.approve_spare_part(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approver() then
    raise exception 'Only the organizer or head engineer can approve changes.';
  end if;
  if (select pending_action from public.spare_parts where id = p_id) = 'delete' then
    delete from public.spare_parts where id = p_id;
    return;
  end if;
  update public.spare_parts
    set is_approved = true, pending_action = null, pending_snapshot = null,
        approved_by = auth.uid(), approved_at = now()
    where id = p_id;
end;
$$;

create or replace function public.reject_spare_part(p_id uuid)
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
    from public.spare_parts where id = p_id;

  if act = 'insert' then
    delete from public.spare_parts where id = p_id;
    return;
  elsif act = 'delete' then
    update public.spare_parts
      set pending_action = null, is_approved = true, approved_by = auth.uid(), approved_at = now()
      where id = p_id;
    return;
  end if;

  update public.spare_parts sp set
    name         = coalesce(snap->>'name', sp.name),
    part_number  = coalesce(snap->>'part_number', sp.part_number),
    quantity     = coalesce((snap->>'quantity')::int, sp.quantity),
    min_quantity = coalesce((snap->>'min_quantity')::int, sp.min_quantity),
    notes        = coalesce(snap->>'notes', sp.notes),
    company_id   = nullif(snap->>'company_id', '')::uuid,
    price        = (snap->>'price')::numeric,
    is_approved = true, pending_action = null, pending_snapshot = null,
    approved_by = auth.uid(), approved_at = now()
  where sp.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Open write RLS: the gate triggers above are the real control now, not RLS.
-- ---------------------------------------------------------------------------
drop policy if exists "companies write" on public.companies;
create policy "companies all authenticated"
  on public.companies for all to authenticated using (true) with check (true);

drop policy if exists "customers write" on public.customers;
drop policy if exists "customers engineer insert" on public.customers;
drop policy if exists "customers owner update" on public.customers;
create policy "customers all authenticated"
  on public.customers for all to authenticated using (true) with check (true);

drop policy if exists "customer_links write" on public.customer_links;
drop policy if exists "customer_links owner write" on public.customer_links;
create policy "customer_links all authenticated"
  on public.customer_links for all to authenticated using (true) with check (true);

drop policy if exists "spare_parts write" on public.spare_parts;
create policy "spare_parts all authenticated"
  on public.spare_parts for all to authenticated using (true) with check (true);

drop policy if exists "spare_part_photos write" on public.spare_part_photos;
create policy "spare_part_photos all authenticated"
  on public.spare_part_photos for all to authenticated using (true) with check (true);

drop policy if exists "spare photos editor write" on storage.objects;
create policy "spare photos write" on storage.objects for insert
  to authenticated with check (bucket_id = 'spare-part-photos');

drop policy if exists "spare photos editor update" on storage.objects;
create policy "spare photos update" on storage.objects for update
  to authenticated using (bucket_id = 'spare-part-photos');

drop policy if exists "spare photos editor delete" on storage.objects;
create policy "spare photos delete" on storage.objects for delete
  to authenticated using (bucket_id = 'spare-part-photos');
