# Plan: Bakım & Garanti (agreements, visits, warranty)

Source design: `Mars Support – Bakım & Garanti.html` (desktop + mobile for Dashboard,
New Agreement, Customers with agreement).

## Decisions already made

| Topic | Decision |
|---|---|
| Agreement | One per **customer**, covering one or more of their machines (`customer_machines`) |
| Yıllık | **One visit.** Customer wants another in the same year → open a new agreement |
| Periyodik | **N visits per year**, N depends on the machine/contract (e.g. 5) |
| Visit | A normal **task**, linked to the agreement. Completing it marks the visit done |
| Warranty | **Per machine** (standard end date) + optional **extended warranty** from an agreement |
| Payments | **Status only**: amount, due date, paid/unpaid. No invoices |
| Send reminder | Creates an **internal task** for the team to follow up. Nothing goes out to the customer |
| Old schedules | `maintenance_schedules` are **replaced** by agreements (migrated) |
| Access | New sidebar item, same access/approval rules as Customers |

## 1. Data model (new migration `2026XXXX_agreements.sql`)

```
agreements
  id, customer_id → customers
  plan            'periodic' | 'annual'
  visits_per_year int   -- periodic: N; annual: forced to 1
  start_date, end_date
  includes_warranty bool, warranty_end date null   -- the "+ Garanti" extension
  amount numeric, currency (reuse task currency), payment_status 'unpaid'|'paid',
  payment_due date null, paid_at date null
  status          'active' | 'ended' | 'cancelled'   -- Expiring/Overdue/Unpaid are DERIVED
  notes, created_by, created_at
  (+ audit_row trigger, same RLS pattern as customer_machines)

agreement_machines            -- which machines the agreement covers
  agreement_id, machine_id → customer_machines    (PK on both)

agreement_visits
  id, agreement_id, seq int, due_date date,
  task_id → tasks null (unique), done_at date null
  -- periodic: N rows generated on create, annual: 1 row

customer_machines  (+ warranty_end date null)      -- standard machine warranty
tasks              (+ agreement_visit_id uuid null, + kind-less: link only)
```

Derived states (computed in a SQL view `agreement_overview`, not stored):
- **Overdue**: a visit with `due_date < today` and not done
- **Expiring**: `end_date` or `warranty_end` within 30 days
- **Unpaid**: `payment_status = 'unpaid'`; overdue-payment if `payment_due < today`
- **Next visit**: min `due_date` of undone visits

Warranty cards/chips read `least(machine.warranty_end, agreement.warranty_end)` style
rules: a machine's *effective* warranty end = latest of its standard end and any active
agreement extension.

## 2. Visit generation (replaces `generate_due_maintenance()`)

- **On agreement create** (server action, one transaction): insert agreement, machine links,
  and N `agreement_visits` with dates spaced evenly across the year
  (`start + i * 12/N months`). The user can edit each date on the form.
- **Task creation** — new RPC `generate_due_agreement_visits()`, called the same place the
  old one is today (dashboard open): for every undone visit with `due_date <= today + lead`
  and no `task_id`, create a task (title `Bakım – <customer>`, customer + machine, due date),
  copy lead assignee, store `task_id`. Idempotent like the current function.
- **Completion** — trigger on `tasks` status → `done`: set `agreement_visits.done_at`.
  Reopening a task clears it. When the last visit is done and `end_date` has passed,
  agreement → `ended`.
- **Renewal** — "Renew" button on an ended/expiring agreement pre-fills New Agreement
  (this is also how Yıllık gets "another one in the same year").

## 3. Migrate old data

One-off section in the migration: for each active `maintenance_schedules` row create a
periodic agreement (`visits_per_year = round(12 / interval_months)`, first visit =
`next_due`, no machines/payment). Mark schedules `active = false`, keep the table for
rollback, remove the `Maintenance` panel from the customer modal and replace it with a
read-only "Agreements" list linking to the new page.

## 4. UI (all from the mockup, using your existing theme tokens, not its Poppins/hex colors)

Route group `app/(app)/agreements/` + sidebar item `nav.agreements` ("Bakım & Garanti")
in `components/app-shell.tsx`.

1. **Dashboard** `/agreements`
   - 4 stat cards (active agreements, visits this month, warranty ≤ 30 d, pending payments)
     from `agreement_overview`
   - Month calendar: visit chips by type (Periyodik/Yıllık/Warranty ends/Overdue),
     type filter tabs, click a chip → the task or agreement
   - Customers-with-agreement list (status pill, next visit)
   - Urgent / Pending payment panel; **Send reminder** → creates a task assigned to the
     agreement's lead/creator ("Call <customer> about payment / renewal")
2. **New Agreement** `/agreements/new` (modal on desktop, full screen on mobile):
   customer, machines (multi-select from that customer's machines), plan, visits/year
   (locked to 1 for Yıllık), start/end, visit dates (editable), warranty extension +
   date, amount/currency/payment status/due date
3. **Customers with agreement** `/agreements/customers` (searchable table/cards)
4. Customer modal: agreements tab; machine row gets a Warranty end field
5. i18n: all strings in `lib/i18n/dictionary.ts` (EN + TR, same as the rest of the app)

## 5. Build order (each step shippable and verifiable)

1. Migration + types (`lib/types.ts`) + RLS/audit + schedule migration
2. Server actions: create/update/cancel agreement, mark paid, renew, send-reminder
3. Visit generator RPC + completion trigger; wire the RPC where the old one is called
4. New Agreement form
5. Dashboard (stat cards, list, urgent/payment panel), then calendar
6. Customers-with-agreement page + customer-modal tab + machine warranty field
7. Mobile pass on all three screens, dark mode check, retire old Maintenance panel
8. Update `PROJECT_STATE.md` / README (maintenance generator section)

## 6. Risks / things I'll watch

- Customer edits go through the **pending-approval gate**. Agreements need a decision
  (see open questions); I'd keep them ungated and audit-logged unless you say otherwise.
- Existing **Warranty / Warranty End custom fields** and the expiring-warranty banner will
  be duplicated by the new machine warranty column → the banner switches to the new
  column; old custom-field values are not auto-copied (they're free text).
- Visit tasks must not break the "require filled-in task before Done" rule; generated
  tasks start as normal `todo` tasks, so the engineer fills the report as usual.
- No test suite is visible in the repo for this area; verification is manual in the
  preview plus SQL checks on the generator (idempotency, double-run, reopen/redo).

## Open questions (defaults in bold, I'll use them unless you say otherwise)

1. Periodic visit dates: **evenly spaced, editable per visit** vs. picked by hand only
2. How early should the visit task appear before its date? **7 days**
3. Should agreements go through the **approval gate** like customer edits? **No**
4. Should a machine's N visits/year come from the **catalog model** (e.g. model X = 4/yr)
   or be typed per agreement? **Typed per agreement**; model default is a later add-on
5. Currency for amounts: **reuse the task currency setting**
