-- KRISHISETU SUPABASE REPAIR / MIGRATION
-- Run this once in Supabase SQL Editor.
-- IMPORTANT: this removes the auth.users -> profiles trigger because a failing
-- auth trigger can surface as "Database error saving new user" during sign-up.
-- KrishiSetu now creates/repairs the profile after the user has authenticated.

create extension if not exists pgcrypto;

-- 1) Remove the old auth trigger that can block registration.
drop trigger if exists on_auth_user_created_krishisetu on auth.users;
drop function if exists public.handle_new_krishisetu_user();

-- 2) Ensure the core tables exist.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'farmer',
  full_name text not null default '',
  mobile text not null default '',
  profile jsonb not null default '{}'::jsonb,
  tutorial_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Repair older installations that have the table but are missing columns.
alter table public.profiles add column if not exists role text default 'farmer';
alter table public.profiles add column if not exists full_name text default '';
alter table public.profiles add column if not exists mobile text default '';
alter table public.profiles add column if not exists profile jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists tutorial_completed boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

update public.profiles set role='farmer' where role is null or role not in ('farmer','buyer');
update public.profiles set full_name='' where full_name is null;
update public.profiles set mobile='' where mobile is null;
update public.profiles set profile='{}'::jsonb where profile is null;
update public.profiles set tutorial_completed=false where tutorial_completed is null;
update public.profiles set created_at=now() where created_at is null;
update public.profiles set updated_at=now() where updated_at is null;

alter table public.profiles alter column role set default 'farmer';
alter table public.profiles alter column full_name set default '';
alter table public.profiles alter column mobile set default '';
alter table public.profiles alter column profile set default '{}'::jsonb;
alter table public.profiles alter column tutorial_completed set default false;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column updated_at set default now();

-- Replace incompatible role checks from earlier versions.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.profiles'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check check (role in ('farmer','buyer'));

-- 4) Updated-at helper.
create or replace function public.set_krishisetu_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute procedure public.set_krishisetu_updated_at();

drop trigger if exists user_app_state_updated_at on public.user_app_state;
create trigger user_app_state_updated_at
before update on public.user_app_state
for each row execute procedure public.set_krishisetu_updated_at();

-- 5) RLS.
alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;

-- Remove policies first so this migration can be run repeatedly.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists app_state_select_own on public.user_app_state;
drop policy if exists app_state_insert_own on public.user_app_state;
drop policy if exists app_state_update_own on public.user_app_state;

create policy profiles_select_own
on public.profiles for select
to authenticated
using (auth.uid() = id);

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy app_state_select_own
on public.user_app_state for select
to authenticated
using (auth.uid() = user_id);

create policy app_state_insert_own
on public.user_app_state for insert
to authenticated
with check (auth.uid() = user_id);

create policy app_state_update_own
on public.user_app_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_app_state to authenticated;

-- 6) Optional helper view for diagnostics (no sensitive auth data).
create or replace view public.krishisetu_profile_health as
select
  p.id,
  p.role,
  (p.full_name <> '') as has_name,
  (p.mobile <> '') as has_mobile,
  p.tutorial_completed,
  p.updated_at
from public.profiles p;

revoke all on public.krishisetu_profile_health from anon;
grant select on public.krishisetu_profile_health to authenticated;

-- After running this migration:
-- 1. Create a NEW test account in KrishiSetu.
-- 2. Confirm email if Supabase email confirmation is enabled.
-- 3. Sign in.
-- 4. KrishiSetu will create the profile after authentication.
