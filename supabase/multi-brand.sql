-- ============================================================
-- Multi-brand foundation (Phase 1) — ADDITIVE, no behaviour change.
-- Existing data all becomes the "Creative IQ" brand; RoboThink is added empty.
-- Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- 1. Brands / organizations --------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo_path text,
  accent_color text,
  email_from text,       -- verified Resend sender for this brand
  email_reply_to text,   -- where parent replies go
  contact_email text,    -- footer email
  contact_phone text,    -- footer phone
  created_at timestamptz default now()
);

insert into public.organizations
  (slug, name, logo_path, accent_color, email_from, email_reply_to, contact_email, contact_phone)
values
  ('creative-iq','Creative IQ','/creative-iq-logo.png','#4d8f0f',
   'noreply@feedback.creative-iq.co.uk','info@creative-iq.co.uk','info@creative-iq.co.uk','07361 594569'),
  ('robothink','RoboThink','/robothink-logo.png','#1c9ad6',
   null,'info@robothink.co.uk','info@robothink.co.uk','078 8886 5338')
on conflict (slug) do nothing;

-- 2. Tag every scoped table with a brand (nullable for now) -------
alter table public.profiles           add column if not exists org_id uuid references public.organizations(id);
alter table public.venues             add column if not exists org_id uuid references public.organizations(id);
alter table public.sessions           add column if not exists org_id uuid references public.organizations(id);
alter table public.rosters            add column if not exists org_id uuid references public.organizations(id);
alter table public.students           add column if not exists org_id uuid references public.organizations(id);
alter table public.instructor_invites add column if not exists org_id uuid references public.organizations(id);

-- 3. Backfill all existing rows to Creative IQ --------------------
do $$
declare ciq uuid;
begin
  select id into ciq from public.organizations where slug = 'creative-iq';
  update public.profiles           set org_id = ciq where org_id is null;
  update public.venues             set org_id = ciq where org_id is null;
  update public.sessions           set org_id = ciq where org_id is null;
  update public.rosters            set org_id = ciq where org_id is null;
  update public.students           set org_id = ciq where org_id is null;
  update public.instructor_invites set org_id = ciq where org_id is null;
end $$;

-- 4. Super-admin flag — can switch between / manage all brands ----
alter table public.profiles add column if not exists is_super boolean default false;
update public.profiles set is_super = true where email = 'inamahmad2023@gmail.com';

-- 5. Anyone signed in can read the brand list (for the switcher + branding)
alter table public.organizations enable row level security;
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select using (auth.uid() is not null);
drop policy if exists organizations_admin on public.organizations;
create policy organizations_admin on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());
