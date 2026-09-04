-- Yer and Makina were custom fields with hardcoded option lists, so the city
-- list drifted from the catalog and a machine could not be filtered by brand.
-- They become real columns pointing at the catalog, and the two custom field
-- definitions are retired.
--
-- Also adds the two money fields recorded against a job.

alter table public.tasks
  add column if not exists city_id        uuid references public.cities(id)         on delete set null,
  add column if not exists company_id     uuid references public.companies(id)      on delete set null,
  add column if not exists model_id       uuid references public.machine_models(id) on delete set null,
  add column if not exists parts_cost     numeric(12,2),
  add column if not exists service_charge numeric(12,2);

create index if not exists tasks_city_id_idx    on public.tasks (city_id);
create index if not exists tasks_company_id_idx on public.tasks (company_id);
create index if not exists tasks_model_id_idx   on public.tasks (model_id);

-- ---------------------------------------------------------------------------
-- Bring the two option lists into the catalog.
-- ---------------------------------------------------------------------------

-- Cities the Yer field offered that the catalog does not have yet.
insert into public.cities (name)
select v.name
  from (values ('Bursa'), ('Batman'), ('Diyarbakır')) as v(name)
on conflict do nothing;

-- The Makina options name their manufacturer, so the brands come from the
-- machine names themselves. Riton and Fastform did not exist as companies —
-- only DOF and XTCERA did — because until now brands were only ever created
-- for spare parts.
insert into public.companies (name)
select v.name
  from (values ('Riton'), ('Fastform')) as v(name)
 where not exists (
   select 1 from public.companies c where lower(c.name) = lower(v.name)
 );

insert into public.machine_models (company_id, name)
select c.id, v.model
  from (values
    ('Riton',    'RITON D-150'),
    ('Riton',    'Riton-L230'),
    ('Fastform', 'Fastform - deskfab')
  ) as v(brand, model)
  join public.companies c on lower(c.name) = lower(v.brand)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Carry each task's existing answers across. field_values stores the chosen
-- option's id, so this joins through the definition's options array to get
-- back to the label, then matches the label into the catalog.
-- ---------------------------------------------------------------------------
with picked as (
  select fv.record_id as task_id, opt->>'label' as label
    from public.field_values fv
    join public.field_definitions fd on fd.id = fv.field_id
    cross join lateral jsonb_array_elements(fd.options) as opt
   where fd.entity = 'task'
     and fd.label = 'Yer'
     and opt->>'id' = trim(both '"' from fv.value::text)
)
update public.tasks t
   set city_id = ct.id
  from picked p
  join public.cities ct on lower(ct.name) = lower(p.label)
 where t.id = p.task_id
   and t.city_id is null;

with picked as (
  select fv.record_id as task_id, opt->>'label' as label
    from public.field_values fv
    join public.field_definitions fd on fd.id = fv.field_id
    cross join lateral jsonb_array_elements(fd.options) as opt
   where fd.entity = 'task'
     and fd.label = 'Makina'
     and opt->>'id' = trim(both '"' from fv.value::text)
)
update public.tasks t
   set model_id = m.id, company_id = m.company_id
  from picked p
  join public.machine_models m on lower(m.name) = lower(p.label)
 where t.id = p.task_id
   and t.model_id is null;

-- Retire the two definitions. field_values cascades off field_definitions, so
-- the old answers go with them — they now live in the columns above.
delete from public.field_definitions
 where entity = 'task' and label in ('Yer', 'Makina');
