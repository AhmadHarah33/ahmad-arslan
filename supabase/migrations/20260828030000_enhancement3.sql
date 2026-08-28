-- =============================================================================
-- Enhancement 3: settings, comments, audit, templates, maintenance, parts usage.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- app_settings — single row of company details (PDF header + branding).
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id              int primary key default 1 check (id = 1),
  company_name    text not null default 'Mars Med Dent',
  company_phone   text not null default '',
  company_address text not null default '',
  logo_url        text,
  updated_at      timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
create policy "app_settings read" on public.app_settings
  for select to authenticated using (true);
create policy "app_settings write" on public.app_settings
  for all to authenticated using (public.is_head()) with check (public.is_head());

-- ---------------------------------------------------------------------------
-- task_comments — discussion thread per task.
-- ---------------------------------------------------------------------------
create table if not exists public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on public.task_comments (task_id);

alter table public.task_comments enable row level security;
create policy "task_comments read" on public.task_comments
  for select to authenticated using (true);
create policy "task_comments insert" on public.task_comments
  for insert to authenticated with check (author_id = auth.uid());
create policy "task_comments update" on public.task_comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_head())
  with check (author_id = auth.uid() or public.is_head());
create policy "task_comments delete" on public.task_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_head());

-- ---------------------------------------------------------------------------
-- audit_log — generic change log (head-only read). Written by a trigger.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  summary    text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
create policy "audit_log read" on public.audit_log
  for select to authenticated using (public.is_head());

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  eid uuid;
  lbl text;
begin
  rec := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);
  eid := nullif(coalesce(rec ->> 'id', rec ->> 'task_id', ''), '')::uuid;
  lbl := coalesce(rec ->> 'title', rec ->> 'name', rec ->> 'label', '');
  insert into public.audit_log (actor_id, entity, entity_id, action, summary)
  values (auth.uid(), TG_TABLE_NAME, eid, lower(TG_OP), lbl);
  return null;
end; $$;

create trigger audit_tasks after insert or update or delete on public.tasks
  for each row execute function public.audit_row();
create trigger audit_task_assignees after insert or delete on public.task_assignees
  for each row execute function public.audit_row();
create trigger audit_customers after insert or update or delete on public.customers
  for each row execute function public.audit_row();
create trigger audit_spare_parts after insert or update or delete on public.spare_parts
  for each row execute function public.audit_row();
create trigger audit_field_definitions after insert or update or delete on public.field_definitions
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- task_templates — prefill new tasks.
-- ---------------------------------------------------------------------------
create table if not exists public.task_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text not null default '',
  priority     public.task_priority not null default 'medium',
  field_values jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
alter table public.task_templates enable row level security;
create policy "task_templates read" on public.task_templates
  for select to authenticated using (true);
create policy "task_templates write" on public.task_templates
  for all to authenticated using (public.can_edit_data()) with check (public.can_edit_data());

-- ---------------------------------------------------------------------------
-- maintenance_schedules — recurring preventive maintenance per customer.
-- ---------------------------------------------------------------------------
create table if not exists public.maintenance_schedules (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  title           text not null default 'Preventive maintenance',
  interval_months int not null default 6,
  next_due        date not null,
  assignee_id     uuid references public.profiles (id) on delete set null,
  active          boolean not null default true,
  last_generated  date,
  created_at      timestamptz not null default now()
);
create index if not exists maintenance_due_idx on public.maintenance_schedules (next_due) where active;

alter table public.maintenance_schedules enable row level security;
create policy "maintenance read" on public.maintenance_schedules
  for select to authenticated using (true);
create policy "maintenance write" on public.maintenance_schedules
  for all to authenticated using (public.can_edit_data()) with check (public.can_edit_data());

-- ---------------------------------------------------------------------------
-- spare_parts low-stock threshold + task_parts consumption.
-- ---------------------------------------------------------------------------
alter table public.spare_parts
  add column if not exists min_quantity int not null default 0;

create table if not exists public.task_parts (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  spare_part_id uuid not null references public.spare_parts (id) on delete cascade,
  quantity      int not null default 1,
  created_at    timestamptz not null default now()
);
create index if not exists task_parts_task_idx on public.task_parts (task_id);

alter table public.task_parts enable row level security;
create policy "task_parts read" on public.task_parts
  for select to authenticated using (true);
create policy "task_parts write" on public.task_parts
  for all to authenticated
  using (public.can_edit_record('task', task_id))
  with check (public.can_edit_record('task', task_id));

-- Keep spare_parts.quantity in sync as parts are consumed/returned.
create or replace function public.apply_part_usage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    update public.spare_parts set quantity = quantity - NEW.quantity
      where id = NEW.spare_part_id;
  elsif TG_OP = 'DELETE' then
    update public.spare_parts set quantity = quantity + OLD.quantity
      where id = OLD.spare_part_id;
  elsif TG_OP = 'UPDATE' then
    if NEW.spare_part_id = OLD.spare_part_id then
      update public.spare_parts set quantity = quantity - (NEW.quantity - OLD.quantity)
        where id = NEW.spare_part_id;
    else
      update public.spare_parts set quantity = quantity + OLD.quantity
        where id = OLD.spare_part_id;
      update public.spare_parts set quantity = quantity - NEW.quantity
        where id = NEW.spare_part_id;
    end if;
  end if;
  return null;
end; $$;

create trigger task_parts_usage
  after insert or update or delete on public.task_parts
  for each row execute function public.apply_part_usage();
