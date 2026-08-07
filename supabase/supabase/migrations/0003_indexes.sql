-- =============================================================================
-- SUPA AI — 0003_indexes.sql
-- Performance indexes + a shared `updated_at` trigger applied to every table
-- that has an `updated_at` column. Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Additional indexes (the ones co-located with table definitions in 0001 are
-- already created with `if not exists` — these cover the lookup paths that
-- are common but not part of the table-defining migration).
-- -----------------------------------------------------------------------------

-- Look up a member row by user (e.g. "list all orgs for a user").
create index if not exists organization_members_user_idx
  on public.organization_members (user_id);

-- Look up members of an org ordered by recency.
create index if not exists organization_members_org_created_idx
  on public.organization_members (org_id, created_at);

-- Subscription lookups by provider IDs (webhook reconciliation).
create index if not exists subscriptions_provider_customer_idx
  on public.subscriptions (provider_customer_id)
  where provider_customer_id is not null;

create index if not exists subscriptions_provider_subscription_idx
  on public.subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists subscriptions_org_idx
  on public.subscriptions (org_id);

-- Usage rollups by user / feature.
create index if not exists usage_records_user_created_idx
  on public.usage_records (user_id, created_at desc);

create index if not exists usage_records_feature_created_idx
  on public.usage_records (feature, created_at desc);

-- API key lookup by hashed_key (authentication path — must be fast).
create index if not exists api_keys_hashed_key_idx
  on public.api_keys (hashed_key)
  where hashed_key is not null and revoked_at is null;

create index if not exists api_keys_user_idx
  on public.api_keys (user_id, created_at desc);

-- AI conversations by org (org-wide chat history views).
create index if not exists ai_conversations_org_created_idx
  on public.ai_conversations (org_id, created_at desc);

-- Files by owner.
create index if not exists files_user_created_idx
  on public.files (user_id, created_at desc);

create index if not exists files_org_created_idx
  on public.files (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at maintenance trigger
--
-- A single reusable function bumps `updated_at` to `now()` on every UPDATE.
-- Attached below to every table that has an `updated_at` column.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
  tables_with_updated_at text[] := array[
    'users',
    'organizations',
    'subscriptions',
    'ai_conversations'
  ];
begin
  foreach t in array tables_with_updated_at loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;',
      t
    );
    execute format(
      'create trigger set_updated_at '
      'before update on public.%I '
      'for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end;
$$;
