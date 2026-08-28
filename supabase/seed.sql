-- =============================================================================
-- Seed data. Runs automatically on `supabase db reset`.
--
-- Creates the first HEAD account so the app is usable immediately, plus a few
-- starter vendor companies. Change the credentials below before first run,
-- then change the password again from the app after logging in.
--
-- Default login:  head@marsmeddent.local  /  ChangeMe123!
-- =============================================================================

do $$
declare
  head_email    text := 'head@marsmeddent.local';
  head_password text := 'ChangeMe123!';
  head_name     text := 'Ahmed';
  head_id       uuid := gen_random_uuid();
begin
  -- Only create if this email doesn't already exist.
  if not exists (select 1 from auth.users where email = head_email) then
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    values (
      head_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      head_email,
      crypt(head_password, gen_salt('bf')),
      now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('full_name', head_name, 'role', 'head'),
      now(),
      now()
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      head_id,
      head_id::text,
      jsonb_build_object('sub', head_id::text, 'email', head_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    );

    -- The on_auth_user_created trigger creates the profile from metadata, but
    -- ensure it exists as head even if the trigger is disabled during seeding.
    insert into public.profiles (id, full_name, first_name, role, can_edit)
    values (head_id, head_name, split_part(head_name, ' ', 1), 'head', true)
    on conflict (id) do update
      set role = 'head', can_edit = true, full_name = excluded.full_name,
          first_name = excluded.first_name;
  end if;
end$$;

-- Starter vendor companies (edit/remove as you like).
insert into public.companies (name)
select v.name
from (values ('Sirona'), ('Planmeca'), ('KaVo'), ('W&H'), ('NSK')) as v(name)
where not exists (select 1 from public.companies c where c.name = v.name);
