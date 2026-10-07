-- =============================================================================
-- Agreement visits no longer become board tasks. They live on the Service
-- (Bakım & Garanti) screen only and are marked done there.
--
--  * generate_due_agreement_visits() becomes a no-op (still returns an int, so
--    existing callers keep working).
--  * Tasks that earlier visits already put on the board are removed. The visits
--    keep their done_at; visits.task_id is cleared by its ON DELETE SET NULL.
--
-- The tasks -> visit completion trigger is left in place: with no linked tasks
-- it never matches a row.
-- =============================================================================
create or replace function public.generate_due_agreement_visits()
returns int
language sql
security definer
set search_path = public
as $$ select 0 $$;

grant execute on function public.generate_due_agreement_visits() to authenticated;

delete from public.tasks
 where id in (select task_id from public.agreement_visits where task_id is not null);
