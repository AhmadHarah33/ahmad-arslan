-- Parts cost and service charge can be priced in different currencies (e.g.
-- parts billed in EUR, labor in TRY), so one shared `currency` column can't
-- represent that. Split it into one column per amount.
alter table public.tasks
  add column if not exists parts_currency text not null default 'TRY'
    check (parts_currency in ('EUR', 'USD', 'TRY')),
  add column if not exists service_currency text not null default 'TRY'
    check (service_currency in ('EUR', 'USD', 'TRY'));

update public.tasks
   set parts_currency = currency,
       service_currency = currency
 where currency is not null;

alter table public.tasks drop column if exists currency;
