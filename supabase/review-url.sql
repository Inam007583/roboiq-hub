-- ============================================================
-- Per-brand Google review link. When set on an organization, the
-- parent feedback email shows a "Leave us a Google review" button.
-- Only brands with a review_url show it (e.g. RoboThink).
-- Safe to re-run. Run in Supabase → SQL Editor.
-- ============================================================
alter table public.organizations add column if not exists review_url text;

-- Then set RoboThink's link (replace with the real Google review URL):
-- update public.organizations
--   set review_url = 'https://g.page/r/XXXXXXXXXXXX/review'
--   where slug = 'robothink';
