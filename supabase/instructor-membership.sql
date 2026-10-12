-- ============================================================
-- Creative IQ Hub — instructor memberships (multi-brand)
-- Lets ONE instructor belong to BOTH Creative IQ and RoboThink.
-- Additive & safe to re-run. Run ONCE in Supabase → SQL Editor.
-- ============================================================

-- 1. Join table: an instructor can be a member of many brands ----
create table if not exists public.memberships (
  user_id    uuid not null references auth.users(id)          on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  role       text not null default 'instructor',
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

alter table public.memberships enable row level security;

-- Instructors read their own memberships; admins read/manage all.
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists memberships_write on public.memberships;
create policy memberships_write on public.memberships
  for all using (public.is_admin()) with check (public.is_admin());

-- 2. Backfill: every existing instructor keeps the brand they're in -
insert into public.memberships (user_id, org_id, role)
select id, org_id, coalesce(role, 'instructor')
from public.profiles
where org_id is not null
on conflict (user_id, org_id) do nothing;

-- 3. Invites: allow one pending invite per (email, brand) ----------
--    (previously unique on email alone, which overwrote the other
--     brand when inviting the same person twice).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.instructor_invites'::regclass and contype = 'u'
  loop
    execute format('alter table public.instructor_invites drop constraint %I', c.conname);
  end loop;
end $$;

create unique index if not exists instructor_invites_email_org_uniq
  on public.instructor_invites (lower(email), org_id);

-- 4. On first sign-in, grant membership for the brand(s) they were
--    invited to (plus their profile's home brand). Runs alongside the
--    existing auth signup trigger; it does not replace it.
create or replace function public.sync_new_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is not null then
    insert into public.memberships (user_id, org_id, role)
    values (new.id, new.org_id, coalesce(new.role, 'instructor'))
    on conflict (user_id, org_id) do nothing;
  end if;

  insert into public.memberships (user_id, org_id, role)
  select new.id, i.org_id, coalesce(i.role, 'instructor')
  from public.instructor_invites i
  where lower(i.email) = lower(new.email) and i.org_id is not null
  on conflict (user_id, org_id) do nothing;

  return new;
end $$;

drop trigger if exists on_profile_created_members on public.profiles;
create trigger on_profile_created_members
  after insert on public.profiles
  for each row execute function public.sync_new_member();
