# Mars Technical Support — Project State / Handoff

> Read this first. It captures what the app is, what's built, how it's wired, and
> what's next — so work can resume cold.

## What this is
An internal work-organizer + database (a focused "Notion clone") for **Mars Med
Dent**'s technical-support team. Installable **PWA** (Add to Home Screen) for
iOS/Android, normal web on PC. Three domains: **Customers**, **Spare parts
inventory**, **Tasks** (Kanban + list). Runs on **self-hosted Supabase (Docker)**,
meant to be exposed to a domain via a tunnel (Cloudflare/ngrok).

- **Repo:** `AhmadHarah33/ahmad-arslan`
- **Working branch:** `claude/notion-clone-mars-med-dent-8vj71l` (all work is here)
- **Deployed:** Vercel project `mars-technical-support`, auto-builds on push to that
  branch. Currently in **PREVIEW MODE** (see below) — no real database yet.

## Tech stack
Next.js 14 (App Router, TS) · Tailwind (CSS-variable design tokens) · Supabase
(Postgres + Auth + Storage + RLS) · @dnd-kit (kanban) · `@ducanh2912/next-pwa` ·
`qrcode`. No other UI/animation libs — charts and motion are hand-rolled inline
SVG + CSS.

## ⚠️ PREVIEW MODE (important)
`NEXT_PUBLIC_PREVIEW=1` (set via `vercel.json`) makes the app run with **no
backend**: login is skipped, every screen is filled with sample data from
`lib/preview.ts`, and every server action early-returns success without touching
Supabase. This is how the Vercel demo runs today.
- To go live: remove `vercel.json` (or set flag `0`), stand up Supabase, set env
  vars from `.env.example`, apply migrations + seed. Then real auth/data works.
- The `PREVIEW` constant is in `lib/preview.ts`; the early-return pattern is in
  every `app/(app)/**/actions.ts`.

## Architecture / key files
- `app/(app)/` — authenticated area (shared shell). Pages: `page.tsx` (dashboard),
  `tasks/`, `customers/`, `spare-parts/`, `admin/`. Route group so all share
  `app/(app)/layout.tsx` (ThemeProvider + AppShell).
- `app/login/` — login screen; `app/print/task/[id]/` — printable service report.
- `components/app-shell.tsx` — sidebar (desktop) + bottom tab bar (mobile) + top
  bar; mounts CommandPalette, Toaster, SettingsModal; ambient glass background.
- `lib/supabase/{client,server,admin}.ts` — Supabase clients (admin = service role,
  server-only). `middleware.ts` — session refresh + route guard (bypassed in preview).
- `lib/permissions.ts` (`isHead`, `canEditData`, `canEditTask`), `lib/auth.ts`
  (`getProfile`/`requireProfile`).
- Custom fields engine: `lib/customFields.ts`, `components/fields/*`,
  `app/(app)/fields/actions.ts`, `lib/fields.server.ts`.
- Tasks: `lib/tasks.server.ts` (`TASK_SELECT`, `normalizeTasks` — flattens the
  `task_assignees` join into `task.assignees[]`), `components/tasks/*`.
- Charts/motion: `components/charts.tsx` (StatTile, ProgressRow, CountBar, Donut,
  MonthBars), `components/count-up.tsx`, `components/skeleton.tsx`.
- Toasts: `lib/toast.ts` (`toast`, `toastErr`) + `components/toaster.tsx`. **Never
  use `alert()`** — use `toastErr`.

## Data model (Postgres, all under RLS)
`profiles` (role head|engineer, can_edit, theme_accent, theme_mode) ·
`companies` · `customers` (+ `customer_links`) · `spare_parts` (+ min_quantity,
`spare_part_photos`) · `tasks` (+ completed_at, no more single assignee_id) ·
`task_assignees` (join, multi-assignee) · `field_definitions` + `field_values`
(custom fields, 8 types) · `task_comments` · `audit_log` (+ generic trigger) ·
`task_templates` · `maintenance_schedules` (+ `generate_due_maintenance()` RPC) ·
`task_parts` (+ inventory-sync trigger) · `app_settings` (company header/branding).
Storage buckets: `spare-part-photos`, `field-files`.
Migrations live in `supabase/migrations/` (init → custom_fields → theme_and_assignees
→ enhancement3 → task_completed_at → maintenance_fn). Seed in `supabase/seed.sql`
(first HEAD account `head@marsmeddent.local` / `ChangeMe123!`, starter companies,
preset custom fields, task templates).

## Roles & rules
- **Head of engineers** = admin: edits everything, manages users (`/admin`), grants
  per-person `can_edit`. **Engineers**: edit their own tasks; edit customers/parts
  only if granted. Enforced by RLS (`is_head()`, `can_edit_data()`, `can_edit_record()`).
- Tasks: multiple assignees. Head assigns anyone; an engineer can **claim** an
  unassigned task (adds only themselves), then edit it.
- Home visibility (home screen only): head sees ALL open tasks (card dashboard:
  KPIs, status donut, 12-month bars, engineer leaderboard, unassigned + low-stock);
  engineers see only unassigned + their own. `/tasks` board still lists everything.

## Features built (chronological enhancements)
1. **v1** — auth, roles, customers, spare parts, tasks kanban/list, admin, PWA.
2. **Custom properties** ("+ Add a property", 8 field types, whole-DB scope) + preset
   fields (Müdahale şekli, Yer, Makina, TEŞHİS, ÇÖZÜM, Rapor; Brand, Installation
   Date, Warranty, Service History, Warranty End). Customer built-ins relabeled
   City/Model/SN.
3. **Theming** (per-user accent + light/dark, CSS-variable tokens), **multi-assignee
   tasks**, customers **grouped by Brand**, smaller spare-parts cards, home visibility.
4. **Quick wins**: ⌘K global search, customer service history, overdue/due-soon
   badges, assignee avatars, change-password.
5. **Analytics** dashboard (stat tiles, per-engineer completion, low-stock).
6. **Workflow**: task comments, **service report PDF** (`/print/task/[id]`),
   task templates, parts-used consumption, preventive maintenance.
7. **Oversight**: CSV import/export, audit trail (head), expiring-warranty banner.
8. **QR**: per-machine QR (customer modal + report) + camera scanner in ⌘K.
9. **Head dashboard redesign** (card grid).
10. **Liquid-glass UI**: green wallpaper backdrop (`public/bg/green-1.jpg`, blurred,
    theme scrim), frosted `.glass` cards/nav/modals. **Light/Dark only (no System).**
11. **Mobile pass**: toasts (replaced all `alert()`), 16px inputs (no iOS zoom),
    bottom-sheet modals (grab handle + swipe-to-dismiss + sticky footer via Modal's
    `footer` prop), FAB for primary "+" on phones, mobile kanban = one-column
    segmented switcher, stacked custom-field labels.
12. **Motion**: window open animations (`.animate-overlay/-window/-pop/-toast`),
    count-up KPIs, growing bars/donut, skeleton shimmer, page cross-fade
    (`.page-enter`). All respect `prefers-reduced-motion`.
13. Per request: **buttons have NO press/hover scale motion**; FAB appears instantly.

## Conventions
- Every GitHub/commit ends with the Co-Authored-By + Claude-Session footer.
- Build check before every push: `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_PREVIEW=1
  npx next build` AND `NEXT_TELEMETRY_DISABLED=1 npx next build` — both must pass.
- Server actions: guard with `if (PREVIEW) return {ok:true, ...}` early-return.
- Errors → `toastErr(msg)`, never `alert`.
- Theme colors come from CSS vars (`--brand-*`, `--surface-*`, `--ink-*`); dark mode
  only via `:root[data-mode="dark"]` (system-following removed).

## What's NOT done / next ideas (backlog)
- **Go live on real Supabase** (biggest next step — currently preview only).
- **Turkish (TR/EN) language toggle** — team works in Turkish.
- **Machines as first-class records** (a customer owns several machines, each with SN
  / warranty / QR / history) — currently one `machine` text field.
- Notifications (assigned / due today / low stock), calendar view of tasks+maintenance.
- Report upgrades: logo upload (app_settings.logo_url exists, no UI yet), customer
  signature, report status (draft→sent), email/share.
- Kanban filters/swimlanes, checklists/subtasks, in-app camera capture.
- Soft-delete/trash + restore, per-module edit grants, offline queue.
- Polish backlog: staggered list reveals, view-transitions API, tighter type scale,
  empty-state illustrations, condense task modal into tabs.

## Verify locally / go live
See `README.md` (Supabase start, env, tunnel, CSV formats, print flow, maintenance
generator, `scripts/backup.sh`). Preview build: `NEXT_PUBLIC_PREVIEW=1 npm run dev`.
