-- =============================================================================
-- Open task editing/assignment + an approval workflow for engineer-driven
-- changes to customers, spare parts, and task completions that consumed
-- spare parts.
--
-- Column-and-enum groundwork only. `alter type ... add value` cannot be used
-- in the same transaction/migration as code that references the new value
-- (same constraint hit when 'organizer' was added to user_role), so the
-- triggers and RLS that read 'pending_approval' live in the next migration.
-- =============================================================================

alter type public.task_status add value if not exists 'pending_approval';

-- ---------------------------------------------------------------------------
-- customers: brand (reuses the existing `companies` table — spare parts
-- already group by it, so customers now share the same concept instead of
-- the ad-hoc "a custom field literally labeled Brand" match the UI used to
-- rely on), a couple of contact fields, an active/inactive flag, and the
-- approval bookkeeping.
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists company_id      uuid references public.companies (id) on delete set null,
  add column if not exists contact_person  text not null default '',
  add column if not exists contact_info    text not null default '',
  add column if not exists status          text not null default 'active'
    check (status in ('active', 'inactive')),
  add column if not exists is_approved     boolean not null default true,
  add column if not exists pending_action  text
    check (pending_action in ('insert', 'update', 'delete')),
  add column if not exists pending_snapshot jsonb,
  add column if not exists approved_by     uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at     timestamptz;

create index if not exists customers_company_idx on public.customers (company_id);
create index if not exists customers_pending_idx on public.customers (is_approved) where is_approved = false;

-- ---------------------------------------------------------------------------
-- spare_parts: a price field (shown in the reference sheet, useful for a
-- parts catalog) and the same approval bookkeeping as customers.
-- ---------------------------------------------------------------------------
alter table public.spare_parts
  add column if not exists price           numeric(12, 2),
  add column if not exists is_approved      boolean not null default true,
  add column if not exists pending_action   text
    check (pending_action in ('insert', 'update', 'delete')),
  add column if not exists pending_snapshot jsonb,
  add column if not exists approved_by      uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at      timestamptz;

create index if not exists spare_parts_pending_idx on public.spare_parts (is_approved) where is_approved = false;
