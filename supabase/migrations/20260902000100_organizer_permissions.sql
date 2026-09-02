-- =============================================================================
-- Permissions for the `organizer` role, plus letting ordinary engineers create
-- customers.
--
-- Role model after this migration:
--
--   head       — everything, including account management (is_head()).
--   organizer  — everything except account management: full write on shared
--                data (companies, customers, spare parts) and on every task.
--   engineer   — creates tasks and customers, manages what they own; gets
--                write access to the rest of the shared data only when the
--                Head flips their `can_edit` grant (used for spare parts).
--
-- Enum values are compared as text throughout: a plain `role = 'organizer'`
-- literal has to resolve the enum at function-creation time, which Postgres
-- refuses while the value is new in the session.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared-data write gate: head and organizer always pass; engineers pass when
-- granted. (companies / customers / customer_links / spare_parts / photos, and
-- the custom-field values that hang off them.)
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role::text in ('head', 'organizer') or can_edit = true)
  );
$$;

-- ---------------------------------------------------------------------------
-- Task management gate: head and organizer manage every task. Engineers keep
-- their existing own-task policies (insert/update/delete when assigned or
-- creator), defined in the initial migration.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_tasks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('head', 'organizer')
  );
$$;

drop policy if exists "tasks head all" on public.tasks;
create policy "tasks manager all"
  on public.tasks for all
  to authenticated
  using (public.can_manage_tasks())
  with check (public.can_manage_tasks());

-- ---------------------------------------------------------------------------
-- New accounts: map the `organizer` metadata role coming from /admin.
-- `can_edit` is redundant for head/organizer (can_edit_data() covers them
-- already) but is kept true so the Team screen reads consistently.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_full text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
  meta_role text := coalesce(new.raw_user_meta_data ->> 'role', 'engineer');
begin
  if meta_role not in ('head', 'organizer', 'engineer') then
    meta_role := 'engineer';
  end if;

  insert into public.profiles (id, full_name, first_name, role, can_edit)
  values (
    new.id,
    meta_full,
    split_part(meta_full, ' ', 1),
    meta_role::public.user_role,
    (meta_role in ('head', 'organizer'))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Engineers may add customers and manage the ones they added. Editing everyone
-- else's customers still needs can_edit_data(); these policies are permissive,
-- so they sit alongside the existing "customers write" grant rather than
-- replacing it.
-- ---------------------------------------------------------------------------
create policy "customers engineer insert"
  on public.customers for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "customers owner update"
  on public.customers for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- Attachment links follow their customer: saveCustomer() replaces them with a
-- delete + insert, so owners need both.
create policy "customer_links owner write"
  on public.customer_links for all
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = customer_id and c.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      where c.id = customer_id and c.created_by = auth.uid()
    )
  );
