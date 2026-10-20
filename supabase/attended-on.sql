-- ============================================================
-- Per-pupil "date attended" override (for flexible-day brands
-- like RoboThink, where a child booked for one day may attend
-- another). Optional: blank ⇒ the email uses the session date.
-- Safe to re-run. Run ONCE in Supabase → SQL Editor.
-- ============================================================
alter table public.students add column if not exists attended_on date;
