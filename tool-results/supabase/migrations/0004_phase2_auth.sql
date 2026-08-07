-- =============================================================================
-- SUPA AI — 0004_phase2_auth.sql
-- Phase 2: Authentication & User Management.
--
-- Creates the rich profile + settings + sessions + notifications + activity
-- tables, expands RBAC to 6 roles, and updates the handle_new_user trigger to
-- provision a profile + user_settings row on signup.
--
-- Design principles (carried from 0001):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every table. Default-deny. No `USING (true)` open policies.
--   • Money is integer cents. Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger from 0003.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles — rich user profile (1:1 with auth.users / public.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  username        text unique,
  full_name       text,
  avatar_url      text,
  phone_number    text,
  country         text,                          -- ISO 3166-1 alpha-2
  time_zone       text default 'UTC',
  locale          text default 'en',
  bio             text,
  company         text,
  job_title       text,
  website         text,
  account_status  text not null default 'active'
                    check (account_status in ('active', 'suspended', 'pending_verification', 'deleted')),
  subscription_plan text not null default 'free'
                    check (subscription_plan in ('free', 'starter', 'pro', 'business', 'enterprise')),
  credits_balance integer not null default 0,    -- AI credits in integer units
  email_verified  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner can read their own profile.
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select
  using (auth.uid() = id);

-- Owner can update their own profile (but not account_status / subscription_plan /
-- credits_balance — those are admin/service-role only).
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert is handled by the trigger (SECURITY DEFINER); no client insert policy.
-- Delete is handled by account deletion (service-role).

-- Username lookup index (case-insensitive via lower).
drop index if exists profiles_username_lower_idx;
create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- -----------------------------------------------------------------------------
-- 2. user_settings — per-user preferences (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.user_settings (
  id                          uuid primary key references auth.users (id) on delete cascade,
  theme                       text not null default 'system'
                                check (theme in ('light', 'dark', 'system')),
  density                     text not null default 'comfortable'
                                check (density in ('comfortable', 'compact')),
  notification_email          boolean not null default true,
  notification_push           boolean not null default true,
  notification_marketing      boolean not null default false,
  notification_security        boolean not null default true,
  notification_product_updates boolean not null default true,
  privacy_profile_visible     boolean not null default true,
  privacy_activity_visible    boolean not null default false,
  privacy_show_in_search      boolean not null default true,
  two_factor_enabled          boolean not null default false,
  session_timeout_minutes     integer not null default 10080,  -- 7 days default
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_self" on public.user_settings;
create policy "user_settings_select_self"
  on public.user_settings for select
  using (auth.uid() = id);

drop policy if exists "user_settings_update_self" on public.user_settings;
create policy "user_settings_update_self"
  on public.user_settings for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 3. user_sessions — multi-device session tracking
-- -----------------------------------------------------------------------------
create table if not exists public.user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  session_token_hash text,                       -- sha256 of the Supabase access token
  user_agent      text,
  ip_address      text,
  device_type     text,                          -- 'desktop' | 'mobile' | 'tablet' | 'unknown'
  os              text,
  browser         text,
  location        text,                          -- coarse geo (city, country) if available
  is_current      boolean not null default false,
  last_active_at  timestamptz not null default now(),
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

alter table public.user_sessions enable row level security;

drop index if exists user_sessions_user_active_idx;
create index if not exists user_sessions_user_active_idx
  on public.user_sessions (user_id, last_active_at desc)
  where revoked_at is null;

drop index if exists user_sessions_token_hash_idx;
create index if not exists user_sessions_token_hash_idx
  on public.user_sessions (session_token_hash)
  where session_token_hash is not null and revoked_at is null;

-- Owner can read + revoke their own sessions.
drop policy if exists "user_sessions_select_self" on public.user_sessions;
create policy "user_sessions_select_self"
  on public.user_sessions for select
  using (user_id = auth.uid());

drop policy if exists "user_sessions_update_self" on public.user_sessions;
create policy "user_sessions_update_self"
  on public.user_sessions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_sessions_insert_self" on public.user_sessions;
create policy "user_sessions_insert_self"
  on public.user_sessions for insert
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. notifications — user-facing notifications
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        text not null,                     -- 'welcome' | 'security' | 'billing' | 'system' | 'social'
  title       text not null,
  message     text not null,
  action_url  text,
  action_label text,
  is_read     boolean not null default false,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

alter table public.notifications enable row level security;

drop index if exists notifications_user_unread_idx;
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

drop index if exists notifications_user_created_idx;
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "notifications_insert_self" on public.notifications;
create policy "notifications_insert_self"
  on public.notifications for insert
  with check (user_id = auth.uid());

drop policy if exists "notifications_delete_self" on public.notifications;
create policy "notifications_delete_self"
  on public.notifications for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. activity_logs — audit trail for auth + account events
-- -----------------------------------------------------------------------------
create table if not exists public.activity_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete set null,
  event_type  text not null,                     -- 'signup' | 'login' | 'logout' | 'password_reset' | 'email_change' | 'profile_update' | 'failed_login' | 'account_deleted' | 'oauth_link' | 'session_revoked'
  severity    text not null default 'info'
                check (severity in ('debug', 'info', 'warn', 'error', 'critical')),
  ip_address  text,
  user_agent  text,
  metadata    jsonb,                              -- event-specific context (never secrets)
  created_at  timestamptz not null default now()
);

alter table public.activity_logs enable row level security;

drop index if exists activity_logs_user_created_idx;
create index if not exists activity_logs_user_created_idx
  on public.activity_logs (user_id, created_at desc);

drop index if exists activity_logs_event_created_idx;
create index if not exists activity_logs_event_created_idx
  on public.activity_logs (event_type, created_at desc);

-- Owner can read their own activity logs.
drop policy if exists "activity_logs_select_self" on public.activity_logs;
create policy "activity_logs_select_self"
  on public.activity_logs for select
  using (user_id = auth.uid());

-- Inserts are service-role only (the API layer writes audit logs with the
-- admin client). No client insert/update/delete policy.

-- -----------------------------------------------------------------------------
-- 6. account_deletion_requests — tracks GDPR data-export + deletion requests
-- -----------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  request_type    text not null check (request_type in ('data_export', 'account_deletion')),
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  download_url    text,                           -- signed URL for data export (time-limited)
  expires_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion_requests_select_self" on public.account_deletion_requests;
create policy "deletion_requests_select_self"
  on public.account_deletion_requests for select
  using (user_id = auth.uid());

-- All writes are service-role (the API orchestrates the async job).

-- -----------------------------------------------------------------------------
-- 7. linked_accounts — OAuth provider connections (for "Connected Accounts" UI)
-- -----------------------------------------------------------------------------
create table if not exists public.linked_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null,                  -- 'google' | 'github' | 'microsoft' | 'apple' | 'email'
  provider_account_id text,                       -- provider's user id
  provider_email  text,
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.linked_accounts enable row level security;

drop policy if exists "linked_accounts_select_self" on public.linked_accounts;
create policy "linked_accounts_select_self"
  on public.linked_accounts for select
  using (user_id = auth.uid());

drop policy if exists "linked_accounts_insert_self" on public.linked_accounts;
create policy "linked_accounts_insert_self"
  on public.linked_accounts for insert
  with check (user_id = auth.uid());

drop policy if exists "linked_accounts_delete_self" on public.linked_accounts;
create policy "linked_accounts_delete_self"
  on public.linked_accounts for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 8. Expand RBAC on public.users: widen the role check constraint.
--    Phase 1 allowed ('owner','admin','member','viewer'). Phase 2 spec requires
--    6 roles: super_admin, admin, team_owner, team_member, premium_user, free_user.
--    We add the new roles to the column (nullable, defaults to 'free_user' for
--    the app-level role). The org-level role on organization_members stays as-is.
-- -----------------------------------------------------------------------------
do $$
begin
  -- Add a new column for the platform-level role (distinct from the org role).
  -- The existing `role` column on `users` is repurposed as the org default;
  -- `platform_role` is the global account role.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'platform_role'
  ) then
    alter table public.users
      add column platform_role text not null default 'free_user'
        check (platform_role in ('super_admin', 'admin', 'team_owner', 'team_member', 'premium_user', 'free_user'));
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 9. Updated trigger: create profile + user_settings + linked_account(email)
--    on auth.users insert.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Core identity row (Phase 1 table — kept for org membership FK).
  insert into public.users (id, email, full_name, avatar_url, platform_role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    'free_user'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, users.full_name),
    avatar_url = coalesce(excluded.avatar_url, users.avatar_url);

  -- Rich profile row.
  insert into public.profiles (id, full_name, avatar_url, email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce((new.raw_user_meta_data->>'email_verified')::boolean, false)
  )
  on conflict (id) do nothing;

  -- Default settings row.
  insert into public.user_settings (id)
  values (new.id)
  on conflict (id) do nothing;

  -- Record the email provider as a linked account.
  insert into public.linked_accounts (user_id, provider, provider_email)
  values (new.id, 'email', new.email)
  on conflict (user_id, provider) do update set
    provider_email = excluded.provider_email;

  return new;
end;
$$;

-- Re-attach (the trigger already exists from 0001; replace it).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 10. updated_at triggers for the new tables.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  new_tables text[] := array['profiles', 'user_settings', 'account_deletion_requests'];
begin
  foreach t in array new_tables loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at '
      'before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end;
$$;
