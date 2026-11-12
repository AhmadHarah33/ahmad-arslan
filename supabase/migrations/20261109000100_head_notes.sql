-- =============================================================================
-- Head notes: a private notebook for the head of the engineers.
--
-- Nobody else can read or write these rows (RLS via is_head()). Mentions are
-- silent: they are stored with the note and nothing else in the app reads them.
--
--   mentions  jsonb array of { kind: 'user' | 'task', id, label }. The label is
--             the text as it appears in the body, so a note still reads right
--             if the user or task is later removed.
--   tags      free-form; the UI autocompletes from tags already in use.
--   archived_at  "deleted" notes go here first; only the archive can purge.
--
-- No audit trigger on purpose: audit_log is readable by others and would leak
-- note text.
-- =============================================================================

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  body        text not null default '',
  mentions    jsonb not null default '[]'::jsonb,
  tags        text[] not null default '{}',
  pinned      boolean not null default false,
  archived_at timestamptz,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notes_mentions_is_array check (jsonb_typeof(mentions) = 'array')
);

create index if not exists notes_order_idx
  on public.notes (archived_at, pinned desc, updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes head only" on public.notes;
create policy "notes head only" on public.notes
  for all to authenticated
  using (public.is_head()) with check (public.is_head());
