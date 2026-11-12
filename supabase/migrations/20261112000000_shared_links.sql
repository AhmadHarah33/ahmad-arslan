-- =============================================================================
-- Shared links: the "Shared drives" card on the home screens. Everyone signed in
-- can read the list; whoever may edit shared data (can_edit_data(): the head,
-- the organizer and anyone granted editing) can add, change and remove links.
-- The two Google Drive folders that used to be hard-coded are seeded.
-- =============================================================================

create table if not exists public.shared_links (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  note        text not null default '',
  url         text not null,
  icon        text not null default 'folder',
  position    int  not null default 0,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint shared_links_title_len check (char_length(title) between 1 and 60),
  constraint shared_links_note_len  check (char_length(note) <= 80),
  constraint shared_links_url_ok    check (url ~* '^https?://[^\s]+$' and char_length(url) <= 600),
  constraint shared_links_icon_ok   check (icon in ('folder','drive','database','desktop','file','link'))
);

alter table public.shared_links enable row level security;

drop policy if exists "shared_links read" on public.shared_links;
create policy "shared_links read" on public.shared_links
  for select to authenticated using (true);

drop policy if exists "shared_links write" on public.shared_links;
create policy "shared_links write" on public.shared_links
  for all to authenticated
  using (public.can_edit_data()) with check (public.can_edit_data());

insert into public.shared_links (title, note, url, icon, position)
select 'Database', 'Opens Google Drive',
       'https://drive.google.com/drive/folders/1sGwxZYtF_dxSXz2HRgu3Erlx61LNqJKr?usp=drive_link', 'database', 1
where not exists (select 1 from public.shared_links where title = 'Database');

insert into public.shared_links (title, note, url, icon, position)
select 'Desktop Data', 'Opens Google Drive',
       'https://drive.google.com/drive/folders/1m_BFgqE0Y-DFh_MydXtBE-vi1xh0904C?usp=drive_link', 'desktop', 2
where not exists (select 1 from public.shared_links where title = 'Desktop Data');
