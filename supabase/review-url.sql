-- ============================================================
-- Google review link PER VENUE (each venue has its own Google
-- review page, e.g. Stanmore vs Hornsey). When a venue has a
-- review_url, the parent feedback email for that venue's sessions
-- shows a "Leave us a Google review" button.
-- Safe to re-run. Run in Supabase → SQL Editor.
-- ============================================================
alter table public.venues        add column if not exists review_url text;
-- org-level fallback (optional; used only if a venue has none set):
alter table public.organizations add column if not exists review_url text;

-- Set each RoboThink venue's link in Admin → Venues, or here, e.g.:
-- update public.venues set review_url = 'https://g.page/r/STANMORE/review' where name ilike '%stanmore%';
-- update public.venues set review_url = 'https://g.page/r/HORNSEY/review'  where name ilike '%hornsey%';
