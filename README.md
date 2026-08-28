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

## Using it on phones ("Add to Home Screen")

A PWA needs **HTTPS** to be installable. Expose your local app through a tunnel
that provides an HTTPS domain, then open that domain on the phone:

- **Cloudflare Tunnel** (free, stable domain):
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
- or **ngrok**: `ngrok http 3000`

Then:

1. Set `NEXT_PUBLIC_SITE_URL` to your tunnel domain and add it to
   `supabase/config.toml` under `[auth] site_url` / `additional_redirect_urls`,
   then restart (`supabase stop && supabase start`, `npm run dev`).
2. On **iOS Safari**: Share → *Add to Home Screen*.
   On **Android Chrome**: menu → *Install app* / *Add to Home screen*.

The app opens fullscreen like a native app, and the login session persists across
restarts.

> For a permanent office setup, run the app + Supabase on one always-on machine
> and point a **named Cloudflare Tunnel** at a fixed subdomain.

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

## Security notes

- All data access is protected by **Row Level Security** in Postgres — the UI's
  permission helpers only decide what controls to *show*.
- `SUPABASE_SERVICE_ROLE_KEY` is used **only** in server actions (creating users)
  and must never be exposed to the browser (no `NEXT_PUBLIC_` prefix).
- `enable_signup = false` in `config.toml`: only the Head can create accounts.
