-- =============================================================================
-- Profile pictures: every user can set their own avatar and a cover image for
-- their settings page.
--
--   profiles.avatar_path / cover_path  path inside the profile-images bucket
--                                      (NULL = none, the UI shows initials / a
--                                      colour gradient)
--
-- The bucket is public-read (the images only show on app screens behind login,
-- and the URLs are unguessable), and each user can only write inside their own
-- folder: <user id>/<file>.
-- =============================================================================

alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists cover_path  text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  8388608,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

drop policy if exists "profile images public read" on storage.objects;
create policy "profile images public read"
  on storage.objects for select
  using (bucket_id = 'profile-images');

drop policy if exists "profile images own write" on storage.objects;
create policy "profile images own write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile images own update" on storage.objects;
create policy "profile images own update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile images own delete" on storage.objects;
create policy "profile images own delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
