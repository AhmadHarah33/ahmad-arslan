-- =============================================================================
-- Mars Technical Support — initial schema, RLS, and storage.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('head', 'engineer');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user. `can_edit` is the per-person edit grant the
-- Head toggles. The Head always has full access regardless of this flag.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  first_name  text not null default '',
  role        public.user_role not null default 'engineer',
  can_edit    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Helper functions used by RLS policies (SECURITY DEFINER to avoid recursive
-- policy evaluation when reading the caller's own role).
create or replace function public.is_head()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'head'
  );
$$;

create or replace function public.can_edit_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'head' or can_edit = true)
  );
$$;

-- ---------------------------------------------------------------------------
-- companies (vendors whose spare parts we stock)
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- customers + their attachment links
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  location      text not null default '',
  machine       text not null default '',
  serial_number text not null default '',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.customer_links (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  label        text not null default 'Link',
  url          text not null
);

-- ---------------------------------------------------------------------------
-- spare parts (per company) + uploaded photos
-- ---------------------------------------------------------------------------
create table if not exists public.spare_parts (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  name         text not null,
  part_number  text not null default '',
  quantity     integer not null default 0,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.spare_part_photos (
  id             uuid primary key default gen_random_uuid(),
  spare_part_id  uuid not null references public.spare_parts (id) on delete cascade,
  storage_path   text not null,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks (Kanban)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('todo', 'in_progress', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high');
  end if;
end$$;

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text not null default '',
  status       public.task_status not null default 'todo',
  priority     public.task_priority not null default 'medium',
  assignee_id  uuid references public.profiles (id) on delete set null,
  customer_id  uuid references public.customers (id) on delete set null,
  position     double precision not null default 0,
  due_date     date,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists spare_parts_company_idx on public.spare_parts (company_id);
create index if not exists customer_links_customer_idx on public.customer_links (customer_id);
create index if not exists spare_part_photos_part_idx on public.spare_part_photos (spare_part_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile whenever an auth user is created.
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
  insert into public.profiles (id, full_name, first_name, role, can_edit)
  values (
    new.id,
    meta_full,
    split_part(meta_full, ' ', 1),
    (case when meta_role = 'head' then 'head' else 'engineer' end)::public.user_role,
    (meta_role = 'head')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles           enable row level security;
alter table public.companies          enable row level security;
alter table public.customers          enable row level security;
alter table public.customer_links     enable row level security;
alter table public.spare_parts        enable row level security;
alter table public.spare_part_photos  enable row level security;
alter table public.tasks              enable row level security;

-- profiles: everyone authenticated can read; users update their own harmless
-- fields; only the Head can change roles/grants (enforced via is_head()).
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated using (true);

create policy "profiles self or head update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_head())
  with check (id = auth.uid() or public.is_head());

create policy "profiles head insert"
  on public.profiles for insert
  to authenticated with check (public.is_head());

-- Read access for all core data (authenticated users).
create policy "companies read"        on public.companies        for select to authenticated using (true);
create policy "customers read"        on public.customers        for select to authenticated using (true);
create policy "customer_links read"   on public.customer_links   for select to authenticated using (true);
create policy "spare_parts read"      on public.spare_parts      for select to authenticated using (true);
create policy "spare_part_photos read" on public.spare_part_photos for select to authenticated using (true);
create policy "tasks read"            on public.tasks            for select to authenticated using (true);

-- Write access to companies / customers / spare parts: Head or granted editors.
create policy "companies write"       on public.companies        for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());
create policy "customers write"       on public.customers        for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());
create policy "customer_links write"  on public.customer_links   for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());
create policy "spare_parts write"     on public.spare_parts      for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());
create policy "spare_part_photos write" on public.spare_part_photos for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());

-- Tasks: the Head manages all; engineers manage tasks they own (assigned or
-- created). Everyone can read (defined above).
create policy "tasks head all"
  on public.tasks for all
  to authenticated
  using (public.is_head())
  with check (public.is_head());

create policy "tasks engineer insert"
  on public.tasks for insert
  to authenticated
  with check (created_by = auth.uid() or assignee_id = auth.uid());

create policy "tasks engineer update"
  on public.tasks for update
  to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid())
  with check (assignee_id = auth.uid() or created_by = auth.uid());

create policy "tasks engineer delete"
  on public.tasks for delete
  to authenticated
  using (assignee_id = auth.uid() or created_by = auth.uid());

-- ===========================================================================
-- Storage: spare-part photos bucket
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('spare-part-photos', 'spare-part-photos', true)
on conflict (id) do nothing;

create policy "spare photos public read"
  on storage.objects for select
  using (bucket_id = 'spare-part-photos');

create policy "spare photos editor write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'spare-part-photos' and public.can_edit_data());

create policy "spare photos editor update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'spare-part-photos' and public.can_edit_data());

create policy "spare photos editor delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'spare-part-photos' and public.can_edit_data());
