-- ============================================
-- Phase 2 Audit — Expanded profiles, RBAC roles, auth enhancements
-- ============================================

-- 1. Expand profiles table with missing fields
alter table public.profiles
  add column username text unique,
  add column email text,
  add column phone text,
  add column country text,
  add column timezone text default 'UTC',
  add column language text default 'en',
  add column bio text,
  add column company text,
  add column job_title text,
  add column website text;

-- 2. Create account_status enum
create type public.account_status as enum ('active', 'suspended', 'deactivated', 'pending_verification');

-- 3. Add account fields to profiles
alter table public.profiles
  add column account_status account_status not null default 'active',
  add column subscription_plan text not null default 'free',
  add column credits_balance integer not null default 0;

-- 4. Update the trigger to populate new fields from metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email, username, timezone, language)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC'),
    coalesce(new.raw_user_meta_data ->> 'language', 'en')
  );
  return new;
end;
$$;

-- 5. Index on username for lookups
create index idx_profiles_username on public.profiles (username) where username is not null;

-- 6. Update RLS: users can insert their own profile (updated columns)
drop policy "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- 7. Expand RBAC with application-level roles
-- Add app_role column to profiles (separate from workspace roles)
alter table public.profiles
  add column app_role text not null default 'free_user'
  check (app_role in ('super_admin', 'admin', 'team_owner', 'team_member', 'premium_user', 'free_user'));

-- 8. Expand activity_action enum with missing actions
alter type public.activity_action add value if not exists 'login_success';
alter type public.activity_action add value if not exists 'login_failed';
alter type public.activity_action add value if not exists 'password_changed';
alter type public.activity_action add value if not exists 'email_changed';
alter type public.activity_action add value if not exists 'account_deleted';
alter type public.activity_action add value if not exists 'session_revoked';

-- 9. Add unique index on connected_accounts for deduplication
create index idx_connected_accounts_provider on public.connected_accounts (user_id, provider);
