-- =============================================================================
-- 1. Catalog: how long each machine model is under factory warranty.
--    The customer's warranty then follows automatically from the installation
--    date (a customer custom field) + this many months; an agreement extension
--    from the Service section is the only way past it.
-- 2. Service agreements: the accounting receipt (makbuz) behind a payment.
--    An agreement can only be marked paid with a receipt on file.
-- 3. Abdulmuin gets the same access as Amr (role = head).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Warranty length per model (months; null = not set yet)
-- ---------------------------------------------------------------------------
alter table public.machine_models
  add column if not exists warranty_months int
    check (warranty_months is null or warranty_months between 0 and 120);

-- ---------------------------------------------------------------------------
-- 2. Receipts
-- ---------------------------------------------------------------------------
alter table public.agreements
  add column if not exists receipt_path text;

-- NOT VALID: rows that were already marked paid before receipts existed are
-- left alone, every new or changed row has to satisfy it.
alter table public.agreements
  drop constraint if exists agreements_paid_needs_receipt;
alter table public.agreements
  add constraint agreements_paid_needs_receipt
    check (payment_status <> 'paid' or receipt_path is not null) not valid;

-- Private bucket: PDF or a photo/scan of the receipt, up to 10 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agreement-receipts', 'agreement-receipts', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "agreement receipts read" on storage.objects;
create policy "agreement receipts read"
  on storage.objects for select to authenticated
  using (bucket_id = 'agreement-receipts');

drop policy if exists "agreement receipts write" on storage.objects;
create policy "agreement receipts write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'agreement-receipts');

drop policy if exists "agreement receipts update" on storage.objects;
create policy "agreement receipts update"
  on storage.objects for update to authenticated
  using (bucket_id = 'agreement-receipts');

drop policy if exists "agreement receipts delete" on storage.objects;
create policy "agreement receipts delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'agreement-receipts');

-- agreement_overview is `select a.*`, so it has to be recreated to expose the
-- new column (same definition as before).
drop view if exists public.agreement_overview;
create view public.agreement_overview
with (security_invoker = true) as
select
  a.*,
  c.name as customer_name,
  (select min(av.due_date) from public.agreement_visits av
     where av.agreement_id = a.id and av.done_at is null)                as next_visit,
  (select count(*) from public.agreement_visits av
     where av.agreement_id = a.id and av.done_at is not null)            as visits_done,
  (select count(*) from public.agreement_visits av
     where av.agreement_id = a.id)                                       as visits_total,
  (a.status = 'active' and exists (
     select 1 from public.agreement_visits av
      where av.agreement_id = a.id and av.done_at is null
        and av.due_date < current_date))                                 as is_overdue,
  (a.status = 'active' and a.end_date <= current_date + 30)              as is_expiring,
  (a.status in ('active', 'ended') and a.payment_status = 'unpaid')      as is_unpaid,
  (a.status in ('active', 'ended') and a.payment_status = 'unpaid'
     and a.payment_due is not null and a.payment_due < current_date)     as payment_overdue
from public.agreements a
join public.customers c on c.id = a.customer_id;

grant select on public.agreement_overview to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Abdulmuin = head (matched by e-mail, so it can't hit a namesake)
-- ---------------------------------------------------------------------------
update public.profiles
   set role = 'head', can_edit = true
 where id in (select id from auth.users where lower(email) = 'abdulmuinolabi@gmail.com');
