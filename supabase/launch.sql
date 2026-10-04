-- ============================================================
-- Creative IQ Hub — launch migration + Row-Level Security
-- Run this ONCE in Supabase → SQL Editor before going live.
-- Safe to re-run (uses IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- 1. Missing columns / type fixes --------------------------------
alter table public.students add column if not exists feedback_sent_at timestamptz;
alter table public.students add column if not exists drive_link text;
alter table public.students add column if not exists safeguarding text;
alter table public.students alter column parent_email drop not null;
alter table public.students alter column time_intro_score type text using time_intro_score::text;
alter table public.students alter column time_build_score type text using time_build_score::text;
alter table public.students alter column time_play_score type text using time_play_score::text;

-- 2. Admin helper (SECURITY DEFINER so it can read profiles without
--    tripping the profiles RLS policy — avoids infinite recursion) ----
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- 3. Enable RLS on every table ----------------------------------
alter table public.profiles            enable row level security;
alter table public.venues              enable row level security;
alter table public.sessions            enable row level security;
alter table public.students            enable row level security;
alter table public.rosters             enable row level security;
alter table public.instructor_invites  enable row level security;
alter table public.session_instructors enable row level security;

-- 4. Policies ----------------------------------------------------

-- profiles: you can read your own; admins read all; admins update
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());
-- (inserts happen via the SECURITY DEFINER signup trigger, which bypasses RLS)

-- venues: any signed-in user can read; admins manage
drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues
  for select using (auth.uid() is not null);
drop policy if exists venues_write on public.venues;
create policy venues_write on public.venues
  for all using (public.is_admin()) with check (public.is_admin());

-- sessions: instructor sees own; admin sees all; admin manages; owner can update
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (instructor_id = auth.uid() or public.is_admin());
drop policy if exists sessions_insert on public.sessions;
create policy sessions_insert on public.sessions
  for insert with check (public.is_admin());
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update using (instructor_id = auth.uid() or public.is_admin())
  with check (instructor_id = auth.uid() or public.is_admin());
drop policy if exists sessions_delete on public.sessions;
create policy sessions_delete on public.sessions
  for delete using (public.is_admin());

-- students: readable/writable by the owning session's instructor, or an admin
drop policy if exists students_rw on public.students;
create policy students_rw on public.students
  for all using (
    public.is_admin() or exists (
      select 1 from public.sessions s
      where s.id = students.session_id and s.instructor_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.sessions s
      where s.id = students.session_id and s.instructor_id = auth.uid()
    )
  );

-- rosters & invites: admin only (signup trigger reads invites via definer)
drop policy if exists rosters_admin on public.rosters;
create policy rosters_admin on public.rosters
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists invites_admin on public.instructor_invites;
create policy invites_admin on public.instructor_invites
  for all using (public.is_admin()) with check (public.is_admin());

-- session_instructors: signed-in read, admin manage
drop policy if exists si_select on public.session_instructors;
create policy si_select on public.session_instructors
  for select using (auth.uid() is not null);
drop policy if exists si_write on public.session_instructors;
create policy si_write on public.session_instructors
  for all using (public.is_admin()) with check (public.is_admin());
