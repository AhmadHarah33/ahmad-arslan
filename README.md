# Mars Technical Support

An internal **work organizer + database** for the Mars Med Dent technical support
team — a focused Notion-style app for **Customers**, **Spare parts inventory**, and
engineer **Tasks** (Kanban board or list view).

It's a **PWA** (Progressive Web App): install it on iPhone/Android via the
browser's **"Add to Home Screen"** — no app store needed. On PC it's a normal
website. The database is **self-hosted Supabase** (Postgres + Auth + Storage) in
Docker.

---

## Features

- 🔐 **Login** ("Mars Technical Support Team"), with devices remembered so users
  don't re-login.
- 🏠 **Personalized dashboard** — time-based greeting ("Morning Ahmed"), your own
  open tasks up top, quick access below.
- 🧑‍🔧 **Roles** — **Head of engineers** (admin: edits everything, manages users,
  grants per-person edit rights) and **Engineers** (manage their own tasks; edit
  shared data only when granted). Enforced by Postgres Row Level Security.
- 👥 **Customers** — name, location, machine, serial number, and multiple
  attachment links (e.g. Google Drive).
- 📦 **Spare parts** — inventory grouped by vendor company, with uploaded photos.
- ✅ **Tasks** — drag-and-drop Kanban (To do / In progress / Done) with a list-view
  toggle, assigned per engineer.
- 🧩 **Custom properties** — a Notion-style **"+ Add a property"** on every card
  (Tasks, Customers, Spare parts) with a small set of field types (text, number,
  date, select, multi-select, checkbox, URL, files). Fields are database-wide, and
  the team's real fields (Müdahale şekli, Yer, Makina, TEŞHİS, ÇÖZÜM, Rapor;
  Brand, Warranty, …) come pre-built. Tag-style fields also show as chips on cards.
- 🎨 **Per-user theme** — light-blue default accent with presets + Light/Dark/System,
  saved to each user's profile.
- 🔎 **Global search** (⌘K) across customers, parts, and tasks — plus **QR scan**
  (on supported devices) to open a machine's record.
- 📊 **Dashboard analytics** — open/overdue/done-this-week tiles, per-engineer
  completion bars, and low-stock alerts.
- 🧾 **Service report PDF** — print/save any task as a branded report.
- 💬 **Comments** per task, **task templates**, **parts-used** consumption that
  decrements inventory, **preventive-maintenance** schedules, **expiring-warranty**
  alerts, **CSV import/export**, an **audit trail** (head), and per-machine **QR codes**.

## Tech stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase · @dnd-kit ·
`@ducanh2912/next-pwa`.

---

## Getting started (local)

### 1. Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Docker](https://www.docker.com/) (for Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli): `npm i -g supabase`

### 2. Start the database

```bash
supabase start
```

This boots Postgres, Auth, and Storage in Docker and **applies the migration and
seed** in `supabase/`. When it finishes it prints an **API URL**, an **anon key**,
and a **service_role key** — keep them for the next step. (Studio UI is at
http://localhost:54323.)

> The seed creates the first **Head** account:
> **`head@marsmeddent.local` / `ChangeMe123!`** — change the password after your
> first login. Edit `supabase/seed.sql` to use different credentials before the
> first `supabase start` (or run `supabase db reset` after editing).

### 3. Configure environment

```bash
cp .env.example .env.local
```

Fill `.env.local` with the values `supabase start` printed:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # server-only, never expose
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:3000 and log in as the Head. Add engineers under **Team**.

---

## Running in production on your own PC (Docker + Cloudflare Tunnel)

This runs the real stack — self-hosted Supabase in Docker plus the Next.js app —
on one machine (your PC), reachable from any device over a permanent domain.

**Important:** the browser talks to Supabase *directly* for login, file uploads,
and live data (see `lib/supabase/client.ts`) — not only through the Next.js
server. That means **two things need public HTTPS addresses**, not one: the app
(port 3000) and the Supabase API gateway (port 54321). A single
`cloudflared tunnel --url http://localhost:3000` only forwards the app, so
logins from a phone would fail. Use a **named tunnel with two hostnames**
instead.

Replace `yourdomain.com` below with your real domain, already added to a free
Cloudflare account (Cloudflare → your domain → nameservers point at Cloudflare).

### 1. Start Supabase

```bash
npm i -g supabase   # if you don't have the CLI yet
supabase start
```

This boots Postgres/Auth/Storage/Studio in Docker via `supabase/config.toml` and
applies the migrations + seed. It prints an **anon key** and a **service_role
key** — keep them.

### 2. Point Supabase at your public domain

Edit `supabase/config.toml`:

```toml
[auth]
site_url = "https://app.yourdomain.com"
additional_redirect_urls = ["https://app.yourdomain.com"]
```

Apply it: `supabase stop && supabase start`.

### 3. Configure the app

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://db.yourdomain.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from step 1>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from step 1>   # server-only
NEXT_PUBLIC_SITE_URL=https://app.yourdomain.com
```

Build and run it in production mode (not `next dev`) so it stays fast and stable:

```bash
npm install
npm run build
npm run start        # serves on http://localhost:3000
```

Keep this running — e.g. `npx pm2 start npm --name mars-app -- start` (then
`pm2 save` + `pm2 startup` so it survives a reboot), or a systemd/Task Scheduler
service if you prefer.

### 4. Install and authenticate `cloudflared`

Install from [Cloudflare's docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/), then:

```bash
cloudflared tunnel login       # opens a browser, pick yourdomain.com
cloudflared tunnel create mars-app
```

This writes a tunnel credentials file and prints its **tunnel ID**.

### 5. Configure the two hostnames

Create `~/.cloudflared/config.yml` (Windows: `%USERPROFILE%\.cloudflared\config.yml`):

```yaml
tunnel: mars-app
credentials-file: /home/you/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:3000
  - hostname: db.yourdomain.com
    service: http://localhost:54321
  - service: http_status:404
```

Then create the DNS records (Cloudflare does this for you):

```bash
cloudflared tunnel route dns mars-app app.yourdomain.com
cloudflared tunnel route dns mars-app db.yourdomain.com
```

### 6. Run the tunnel permanently

```bash
cloudflared service install
```

This installs `cloudflared` as an OS service using `config.yml`, so the tunnel
survives reboots. (Or run `cloudflared tunnel run mars-app` in a terminal /
under `pm2` while testing.)

### 7. Verify

Open `https://app.yourdomain.com` on your phone → log in as the seeded Head →
confirm it loads data and file uploads work. Then, on **iOS Safari**: Share →
*Add to Home Screen*; on **Android Chrome**: menu → *Install app*. The app opens
fullscreen like a native app, and the session persists across restarts.

> As long as your PC, Docker, the Next.js process, and `cloudflared` are all
> running, the app is reachable. If the PC sleeps or loses power, the app goes
> down until it's back — there's no automatic failover on a single machine.

---

## Deploy to Vercel (UI preview)

This branch ships a **preview/demo mode** for reviewing the UI with no backend.
`vercel.json` sets `NEXT_PUBLIC_PREVIEW=1` at build time, so a Vercel deployment
of this branch:

- skips login and fills every screen with sample data,
- shows a "Preview mode — sample data" banner,
- persists nothing (all writes are no-ops).

Just import the repo in Vercel (Next.js is auto-detected — no env vars needed) and
deploy. Pushes to this branch auto-rebuild.

> For a **real** deployment (login + saving), remove `vercel.json` (or set the flag
> to `0`) and add the Supabase env vars from `.env.example`.

## Project structure

```
app/
  login/              Login screen (public)
  (app)/              Authenticated area (shared shell)
    page.tsx          Personalized dashboard
    tasks/            Kanban board + list view (+ actions.ts)
    customers/        Customer list + editor (+ actions.ts)
    spare-parts/      Inventory by company + photos (+ actions.ts)
    admin/            Team management — Head only (+ actions.ts)
components/           App shell, modal, feature UIs
lib/
  supabase/           Browser / server / admin clients
  auth.ts             Session + profile helpers
  permissions.ts      Role/permission helpers (UI); RLS is the real guard
  types.ts            Shared domain types
supabase/
  migrations/         Schema, RLS policies, storage bucket
  seed.sql            First Head account + starter companies
  config.toml         Local Supabase config
```

## Operations

- **CSV import/export** — on the Customers and Spare parts pages (Import / Export).
  - Customers CSV columns: `name, city, model, sn, brand`.
  - Spare parts CSV columns: `company, name, part_number, quantity` (companies are
    created automatically if new).
- **Service report** — open a task → **Download report** opens `/print/task/<id>`,
  which auto-launches the browser print dialog (Save as PDF). The company header
  comes from `app_settings` (editable by the head).
- **Preventive maintenance** — add a schedule on a customer; due schedules create
  tasks automatically the next time anyone opens the dashboard
  (`generate_due_maintenance()`).
- **Backups** — run `scripts/backup.sh` (uses `pg_dump` against the local Supabase
  Postgres on port 54322). Schedule it with cron for automated daily backups; see
  the header of the script for the exact crontab line and restore command.

## Security notes

- All data access is protected by **Row Level Security** in Postgres — the UI's
  permission helpers only decide what controls to *show*.
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** in server actions (creating users)
  and must never be exposed to the browser (no `NEXT_PUBLIC_` prefix).
- `enable_signup = false` in `config.toml`: only the Head can create accounts.
