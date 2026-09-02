-- =============================================================================
-- Adds the `organizer` role.
--
-- An organizer (e.g. the person running spare-parts stock and coordinating the
-- team) has full access to shared data and to every task — the same reach as
-- the Head — but NOT account management: creating users and changing roles
-- stays Head-only via is_head().
--
-- The enum value has to be committed before anything can reference it, so this
-- migration only adds the value; the policies that use it live in the next one.
-- =============================================================================

alter type public.user_role add value if not exists 'organizer';
