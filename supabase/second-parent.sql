-- ============================================================
-- Second parent email: feedback can be sent to two parents.
-- Optional on both the roster (template) and the session pupil.
-- Safe to re-run. Run ONCE in Supabase → SQL Editor.
-- ============================================================
alter table public.students add column if not exists parent_email_2 text;
alter table public.rosters  add column if not exists parent_email_2 text;
