-- =============================================================================
-- Enhancement 2: per-user theme + multiple assignees per task.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Per-user theme settings (default light-blue "sky", system light/dark).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists theme_accent text not null default 'sky',
  add column if not exists theme_mode text not null default 'system';

-- ---------------------------------------------------------------------------
-- Multiple engineers per task via a join table.
-- ---------------------------------------------------------------------------
create table if not exists public.task_assignees (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create index if not exists task_assignees_profile_idx
  on public.task_assignees (profile_id);

-- Backfill from the old single-assignee column, then retire it.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks'
      and column_name = 'assignee_id'
  ) then
    insert into public.task_assignees (task_id, profile_id)
    select id, assignee_id from public.tasks
    where assignee_id is not null
    on conflict do nothing;

    -- Drop policies that referenced assignee_id before dropping the column.
    drop policy if exists "tasks engineer insert" on public.tasks;
    drop policy if exists "tasks engineer update" on public.tasks;
    drop policy if exists "tasks engineer delete" on public.tasks;

    alter table public.tasks drop column assignee_id;
  end if;
end$$;

-- Helpers ------------------------------------------------------------------ --
create or replace function public.is_task_member(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_assignees
    where task_id = p_task and profile_id = auth.uid()
  );
$$;

create or replace function public.task_has_assignees(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.task_assignees where task_id = p_task);
$$;

-- Re-point can_edit_record's task branch at membership instead of assignee_id.
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
    return exists (
      select 1 from public.tasks t
      where t.id = p_record and t.created_by = auth.uid()
    ) or public.is_task_member(p_record);
  end if;
  return false;
end;
$$;

-- Recreate task write policies without assignee_id --------------------------- --
create policy "tasks engineer insert"
  on public.tasks for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "tasks engineer update"
  on public.tasks for update
  to authenticated
  using (created_by = auth.uid() or public.is_task_member(id))
  with check (created_by = auth.uid() or public.is_task_member(id));

create policy "tasks engineer delete"
  on public.tasks for delete
  to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS for task_assignees:
--   read   -> any authenticated
--   insert -> head assigns anyone; an engineer may add ONLY themselves and
--             ONLY to a task that currently has no assignees (self-claim)
--   delete -> head, or a member removing themselves
-- ---------------------------------------------------------------------------
alter table public.task_assignees enable row level security;

create policy "task_assignees read"
  on public.task_assignees for select to authenticated using (true);

create policy "task_assignees insert"
  on public.task_assignees for insert
  to authenticated
  with check (
    public.is_head()
    or (profile_id = auth.uid() and not public.task_has_assignees(task_id))
  );

create policy "task_assignees delete"
  on public.task_assignees for delete
  to authenticated
  using (public.is_head() or profile_id = auth.uid());
