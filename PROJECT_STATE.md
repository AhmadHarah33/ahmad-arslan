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
- **Working branch:** `claude/task-screen-animation-rewrite-kqhwct` (all work is here).
  `claude/notion-clone-mars-med-dent-8vj71l` is the older branch Vercel builds from.
- **LIVE (production):** `https://www.marsmeddenterp.site` — the real deployment.
  Next.js production build on the office PC, self-hosted Supabase in Docker
  alongside it, exposed through a Cloudflare Tunnel. **Real database, real
  accounts** (see "Live deployment" below). This is what the team uses.
- **Vercel demo:** project `mars-technical-support`, builds from the old branch and
  still runs in **PREVIEW MODE** (see below) — sample data, no backend. It is a
  UI showcase only and is *not* the production app.

## Tech stack
Next.js 14 (App Router, TS) · Tailwind (CSS-variable design tokens) · Supabase
(Postgres + Auth + Storage + RLS) · @dnd-kit (kanban) · `@ducanh2912/next-pwa` ·
`qrcode`. No other UI/animation libs — charts and motion are hand-rolled inline
SVG + CSS.

## Live deployment (production)
Runs on the office Windows PC, reached from anywhere at
`https://www.marsmeddenterp.site`.
- **App:** Next.js **production** build (`npm run build` + `npm start`) on port
  3000. Dev mode was far slower (per-route JIT compile) — do not run `next dev`
  as the live server.
- **Database:** self-hosted Supabase stack in Docker (Postgres 15, GoTrue, Kong,
  PostgREST, Storage, Realtime, Studio). Migrations in `supabase/migrations/`.
- **Ingress:** Cloudflare Tunnel (dashboard-managed, token-based). Its compose
  file lives in `cloudflared/` **and is gitignored — it contains the tunnel auth
  token. Never commit it.**
- **Uptime:** Windows Task Scheduler job `MarsApp-Watchdog` runs every 2 min via
  `wscript.exe` + a VBS launcher (so no console window flashes). It starts Next
  only if port 3000 isn't already listening. Scripts in
  `C:\Users\MARS TST\mars-ops\`.
- **Reboots:** Docker Desktop is a *user-session* app, so the stack only comes
  back after someone logs in. For unattended reboots, enable Windows auto-login.
- **Accounts:** 6 real users — Amr (head), Merve (organizer), Abdulmuin, Ahmed,
  Ali Kaan, Ömer (engineers). Self-registration is disabled; the head creates
  accounts from `/admin`.

## ⚠️ PREVIEW MODE (Vercel demo only)
`NEXT_PUBLIC_PREVIEW=1` (set via `vercel.json`) makes the app run with **no
backend**: login is skipped, every screen is filled with sample data from
`lib/preview.ts`, and every server action early-returns success without touching
Supabase. **This applies to the Vercel demo only — production is not in preview
mode.**
- The `PREVIEW` constant is in `lib/preview.ts`; the early-return pattern is in
  every `app/(app)/**/actions.ts`.
- It costs real maintenance: 51 branches across 30 of 67 files, so every feature
  must be written twice. Keep it only if the demo is still worth that. See
  `CODE_REVIEW.md` §8.

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
`spare_part_photos`) · `tasks` (+ completed_at, no more single assignee_id;
`status` enum is now `todo|in_progress|done|stuck`) ·
`task_assignees` (join, multi-assignee) · `field_definitions` + `field_values`
(custom fields, 8 types) · `task_comments` · `audit_log` (+ generic trigger) ·
`task_templates` · `maintenance_schedules` (+ `generate_due_maintenance()` RPC) ·
`task_parts` (+ inventory-sync trigger) · `app_settings` (company header/branding).
Storage buckets: `spare-part-photos`, `field-files`.
Migrations live in `supabase/migrations/` (init → custom_fields → theme_and_assignees
→ enhancement3 → task_completed_at → maintenance_fn → app_background →
**task_status_stuck**). Seed in `supabase/seed.sql` (first HEAD account
`head@marsmeddent.local` / `ChangeMe123!`, starter companies, preset custom
fields, task templates).

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
14. **Noteflow-style card redesign**: whole app restyled to a pill-nav shell (rail +
    top bar with teammate avatar stack), rich task cards with priority chip/subtitle/
    progress derived from status/due strip/avatar+attachment+comment counts,
    `.seg`/`.icon-btn` shared classes.
15. **Self-hosted production docs**: README now has a full "Docker + Cloudflare
    Tunnel" walkthrough. Key fact for next time: the **browser talks to Supabase
    directly** (login/uploads via `lib/supabase/client.ts`), so production needs
    **two public hostnames** through the tunnel (app :3000 + Supabase API :54321),
    not one — a single-hostname tunnel breaks off-device logins.
16. **Mobile board fix**: replaced the one-column segmented switcher with the
    pre-redesign pattern — all Kanban columns render together in a horizontally
    scrolling, snap-to-column row, so drag-and-drop between statuses works on
    phones again (desktop grid unchanged). Shell chrome (`.glass-strong`) made
    frosted (90% opacity + blur) instead of flat opaque white.
17. **Board rebuild (compact cards + Stuck column + tone tokens)** — the current
    card/board design. Cards shrunk to Notion density (title, customer, one
    wrapping meta row: avatars/priority/due/counts) — dropped the progress bar
    since it was 1:1 derived from status and added no info. Added a 4th status,
    **`stuck`** (Postgres enum via `alter type ... add value`, migration
    `20260828070000_task_status_stuck.sql`); `TASK_STATUSES` in `lib/types.ts`
    drives the board columns, task-modal status `<select>`, and the dashboard
    donut, so adding a status only means updating that one array + its
    `STATUS_VAR` color entry. **Status/priority colors now live in `--tone-*`
    CSS vars** (`app/globals.css`: `.tone-neutral/-progress/-done/-stuck/-warn/
    -purple`) with separate light/dark values — replaced every hard-coded
    light-only Tailwind chip color (`bg-blue-50` etc.) across `components/ui.tsx`,
    `lib/customFields.ts` tag colors, `lib/dates.ts` due badges, and
    `.btn-danger`, since those were unreadable in dark mode before. Fixed a
    **pre-existing hydration bug**: `DndContext` (dnd-kit) had no explicit `id`,
    so its a11y ids were generated from a render counter that differed
    server vs. client — React discarded and re-rendered the whole board on
    every load. Fixed with `<DndContext id="task-board" ...>`.
18. **Task board/modal animation rewrite** — the board's drag-and-drop had no
    real motion: it used raw `useDraggable`/`useDroppable` from
    `@dnd-kit/core` only, so cards teleported into their new slot instead of
    sliding, even though `@dnd-kit/sortable` + `@dnd-kit/utilities` were
    already in `package.json` and unused anywhere. Rewrote
    `components/tasks/board.tsx`'s drag flow around a flat `tasks` array:
    `onDragOver` live-reorders it across and within columns, `useSortable` +
    `CSS.Transform` give each card FLIP-style motion, `closestCorners`
    collision detection + `MeasuringStrategy.Always` make cross-column drops
    reliable, and a custom `dropAnimation` matches the app's
    `cubic-bezier(0.32, 0.72, 0, 1)` easing. `moveTask` now gets a real
    fractional `position` (midpoint of neighbors) instead of always
    `Date.now()`, so in-column reordering persists correctly. Also: every
    kanban card had been using `.card` (full glass, 20px `backdrop-filter`
    blur) — recomputing blur on every dragged/reflowed card was the actual
    frame-rate killer. New flat `.task-card` class (solid surface + border +
    shadow-only hover, `app/globals.css`) replaces it for board cards only;
    list view/other `.card` usages untouched. Also gave the shared
    `components/modal.tsx` (task modal, all other modals) a real close
    animation — a `closing` state plays `.animate-*-out` keyframes before
    unmounting instead of just vanishing — respecting
    `prefers-reduced-motion` throughout.
19. **Task board mobile UX pass** — drag-and-drop was rough on touch (fights
    native scroll, fiddly with a thumb), so it's now desktop-only:
    `components/tasks/board.tsx` gained a `useIsDesktop()` hook
    (`matchMedia("(min-width: 768px)")`, defaults to `false` so SSR and the
    first client render agree) and cards pass `draggable={isDesktop &&
    canEditTask(...)}` into `useSortable` — on mobile that means no
    listeners are attached at all, and `touch-none` is only applied when
    actually draggable so the column keeps scrolling normally under a
    finger. In its place, each card gets a "⋯" button (`md:hidden`,
    top-right of `CardBody`) opening a bottom `MobileActionSheet` with
    "Edit task" (opens `TaskModal`, same as tapping the card) and "Move
    to…" (lists the other columns; picking one calls the same `moveTask`
    server action the desktop drag uses, appended to the end of the target
    column via `onQuickMove`). Also removed the floating `Fab` "+" button
    from the tasks page — each column already has its own small "+" in its
    header, so the FAB was a redundant, oversized control on small screens.
    Moved the task modal's "Activity" section (comments) up to right after
    the Customer field, before Properties/Parts used — it used to sit at
    the very bottom of the form, past a potentially long custom-fields
    list, making it easy to miss. No permissions code changed for the
    "head" role's edit access — `canEditTask`/`canEditData` in
    `lib/permissions.ts` already return `true` for `role === "head"`
    everywhere (tasks, customers, spare parts), including custom-field
    rename/delete (e.g. renaming the `TEŞHİS` field) via each page's
    `CustomFields canManage={...}` prop, which was already wired to that
    check.

## Conventions
- Every GitHub/commit ends with the Co-Authored-By + Claude-Session footer.
- Build check before every push: `NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_PREVIEW=1
  npx next build` AND `NEXT_TELEMETRY_DISABLED=1 npx next build` — both must pass.
- Server actions: guard with `if (PREVIEW) return {ok:true, ...}` early-return.
- Errors → `toastErr(msg)`, never `alert`.
- Theme colors come from CSS vars (`--brand-*`, `--surface-*`, `--ink-*`); dark mode
  only via `:root[data-mode="dark"]` (system-following removed).

## What's NOT done / next ideas (backlog)
- **Go live on real Supabase** (biggest next step — currently preview only). See
  README's "Running in production on your own PC (Docker + Cloudflare Tunnel)"
  section for the exact steps if self-hosting; remember the two-hostname tunnel
  requirement above.
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
