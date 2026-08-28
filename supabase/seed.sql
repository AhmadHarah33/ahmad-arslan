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

-- ---------------------------------------------------------------------------
-- Preset custom fields (matches the team's Notion setup). These are ordinary
-- field_definitions rows, so they behave exactly like fields added via the
-- "+ Add a property" button — editors can rename, reorder, or remove them.
-- Built-ins already cover: tasks -> Status/Assignee/Due/Priority/Customer;
-- customers -> Name/City(location)/Model(machine)/SN(serial_number).
-- ---------------------------------------------------------------------------
insert into public.field_definitions (entity, label, field_type, options, position)
select d.entity::public.field_entity, d.label, d.field_type::public.field_type,
       d.options::jsonb, d.position
from (values
  -- Tasks / report card
  ('task', 'Müdahale şekli', 'select',
    '[{"id":"o_musteride","label":"müşteride","color":"amber"},
      {"id":"o_uzaktan","label":"uzaktan","color":"blue"},
      {"id":"o_serviste","label":"serviste","color":"green"}]', 1.0),
  ('task', 'Yer', 'select',
    '[{"id":"o_istanbul","label":"İstanbul","color":"amber"},
      {"id":"o_ankara","label":"Ankara","color":"blue"},
      {"id":"o_izmir","label":"İzmir","color":"green"}]', 2.0),
  ('task', 'Makina', 'select',
    '[{"id":"o_riton","label":"RITON D-150","color":"purple"}]', 3.0),
  ('task', 'TEŞHİS', 'text', '[]', 4.0),
  ('task', 'ÇÖZÜM', 'text', '[]', 5.0),
  ('task', 'Rapor', 'files', '[]', 6.0),
  -- Customers
  ('customer', 'Brand', 'select',
    '[{"id":"o_micronx","label":"MicroNX","color":"blue"}]', 1.0),
  ('customer', 'Installation Date', 'date', '[]', 2.0),
  ('customer', 'Warranty', 'select',
    '[{"id":"o_in","label":"IN","color":"green"},
      {"id":"o_out","label":"OUT","color":"red"}]', 3.0),
  ('customer', 'Service History', 'files', '[]', 4.0)
) as d(entity, label, field_type, options, position)
where not exists (
  select 1 from public.field_definitions f
  where f.entity = d.entity::public.field_entity and f.label = d.label
);
