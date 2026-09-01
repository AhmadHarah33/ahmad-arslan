-- Add a fourth Kanban column: "Stuck" — work that is blocked and needs
-- attention, sitting after Done on the board.
--
-- `alter type ... add value` cannot run inside a transaction block on older
-- Postgres, and `if not exists` makes re-running the migration safe.
alter type public.task_status add value if not exists 'stuck';
