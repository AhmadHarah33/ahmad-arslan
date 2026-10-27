-- =============================================================================
-- Order lists: a saved "what to order from this brand" list, picked by hand
-- from the spare parts (not the whole brand) with a quantity per line.
-- Each list is numbered and can be re-downloaded as a PDF later.
--
-- Lines keep a snapshot of the part's number / name / first photo, so
-- an old order still reads the way it did when it was made even if the part is
-- edited or deleted afterwards (spare_part_id then goes null).
--
-- Head / organizer only: the same people who approve parts.
-- =============================================================================

create table if not exists public.order_lists (
  id          uuid primary key default gen_random_uuid(),
  number      bigint generated always as identity,
  company_id  uuid references public.companies (id) on delete set null,
  -- Brand name at the time, for the same reason lines are snapshotted.
  company_name text not null default '',
  supplier    text not null default '',
  notes       text not null default '',
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.order_list_items (
  id            uuid primary key default gen_random_uuid(),
  order_list_id uuid not null references public.order_lists (id) on delete cascade,
  spare_part_id uuid references public.spare_parts (id) on delete set null,
  position      int  not null default 0,
  part_number   text not null default '',
  name          text not null,
  quantity      int  not null check (quantity > 0 and quantity <= 100000),
  photo_path    text
);

create index if not exists order_lists_company_idx on public.order_lists (company_id);
create index if not exists order_list_items_order_idx on public.order_list_items (order_list_id, position);

alter table public.order_lists      enable row level security;
alter table public.order_list_items enable row level security;

drop policy if exists "order_lists read" on public.order_lists;
create policy "order_lists read" on public.order_lists
  for select to authenticated using (true);
drop policy if exists "order_lists managers write" on public.order_lists;
create policy "order_lists managers write" on public.order_lists
  for all to authenticated
  using (public.is_approver()) with check (public.is_approver());

drop policy if exists "order_list_items read" on public.order_list_items;
create policy "order_list_items read" on public.order_list_items
  for select to authenticated using (true);
drop policy if exists "order_list_items managers write" on public.order_list_items;
create policy "order_list_items managers write" on public.order_list_items
  for all to authenticated
  using (public.is_approver()) with check (public.is_approver());

drop trigger if exists audit_order_lists on public.order_lists;
create trigger audit_order_lists after insert or update or delete on public.order_lists
  for each row execute function public.audit_row();
