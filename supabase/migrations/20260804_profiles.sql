-- ============================================
-- Supa AI Phase 2 — Profiles Table
-- ============================================
-- Run this migration in your Supabase SQL Editor.

-- 1. Create profiles table linked to auth.users
create table public.profiles (
  id          uuid not null references auth.users on delete cascade primary key,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. RLS Policies

-- Anyone can read any profile (needed for future features like mentions)
create policy "Profiles are viewable by everyone"
  on public.profiles
  for select
  using (true);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- Users can update their own profile only
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users cannot delete profiles (handled by on delete cascade from auth.users)

-- 4. Auto-create profile on signup via trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user();

-- 5. Auto-update updated_at timestamp
create or replace function public.handle_profile_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_profile_updated
  before update on public.profiles
  for each row
  execute procedure public.handle_profile_updated();

-- 6. Index for fast lookups
create index idx_profiles_id on public.profiles (id);
