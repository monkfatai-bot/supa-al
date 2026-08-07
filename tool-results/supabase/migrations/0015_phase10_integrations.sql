-- =============================================================================
-- SUPA AI — 0015_phase10_integrations.sql
-- Phase 10: Integration Hub & Marketplace — connectors, credentials, webhooks,
-- sync jobs, marketplace apps, installs, reviews/ratings, health, permissions,
-- versions, analytics, logs, and events.
--
-- 15 tables, workspace-scoped with default-deny RLS. The shared
-- `public.is_workspace_member(ws_id, user_id)` SECURITY DEFINER function
-- (created in 0009_phase7_workspace.sql) backs every workspace policy.
-- The shared `public.set_updated_at()` trigger (from 0003_indexes.sql)
-- maintains `updated_at` on every table that has one.
--
-- Design principles (carried from 0001 / 0009 / 0011 / 0012 / 0014):
--   • Idempotent — every statement is safe to re-run.
--   • RLS on every new table. Default-deny. No `USING (true)` open policies.
--   • Timestamps are timestamptz.
--   • updated_at maintained by the shared set_updated_at() trigger.
-- =============================================================================

-- =============================================================================
-- 1. integrations
-- =============================================================================
create table if not exists public.integrations (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  app_id          uuid references public.marketplace_apps (id) on delete set null,
  connector_key   text not null,
  name            text not null,
  status          text not null default 'disconnected'
                    check (status in ('connected','disconnected','error','paused','expired','revoked')),
  auth_type       text not null default 'none'
                    check (auth_type in ('oauth2','api_key','basic','webhook','none')),
  config          jsonb not null default '{}',
  capabilities    jsonb not null default '[]',
  last_synced_at  timestamptz,
  last_error      text,
  error_count     integer not null default 0,
  installed_by    uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.integrations enable row level security;

create index if not exists integrations_workspace_idx
  on public.integrations (workspace_id, created_at desc);
create index if not exists integrations_status_idx
  on public.integrations (workspace_id, status);
create index if not exists integrations_connector_idx
  on public.integrations (workspace_id, connector_key);
create index if not exists integrations_app_idx
  on public.integrations (app_id);

drop policy if exists "integrations_select_member" on public.integrations;
create policy "integrations_select_member" on public.integrations for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integrations_insert_member" on public.integrations for insert
  on public.integrations;
create policy "integrations_insert_member" on public.integrations for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and installed_by = auth.uid());

drop policy if exists "integrations_update_member" on public.integrations;
create policy "integrations_update_member" on public.integrations for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integrations_delete_member" on public.integrations;
create policy "integrations_delete_member" on public.integrations for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_integrations_updated_at
  before update on public.integrations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. integration_credentials
-- =============================================================================
create table if not exists public.integration_credentials (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  type            text not null check (type in (
                    'oauth_access_token','oauth_refresh_token','api_key',
                    'basic_password','webhook_secret','client_secret','bearer_token'
                  )),
  encrypted_value text not null,
  key_version     integer not null default 1,
  expires_at      timestamptz,
  scopes          jsonb not null default '[]',
  metadata        jsonb not null default '{}',
  last_rotated_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.integration_credentials enable row level security;

create index if not exists integration_credentials_integration_idx
  on public.integration_credentials (integration_id);
create index if not exists integration_credentials_workspace_idx
  on public.integration_credentials (workspace_id, integration_id);
create index if not exists integration_credentials_type_idx
  on public.integration_credentials (integration_id, type);

drop policy if exists "integration_credentials_select_member" on public.integration_credentials;
create policy "integration_credentials_select_member" on public.integration_credentials for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_credentials_insert_member" on public.integration_credentials;
create policy "integration_credentials_insert_member" on public.integration_credentials for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_credentials_update_member" on public.integration_credentials;
create policy "integration_credentials_update_member" on public.integration_credentials for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_credentials_delete_member" on public.integration_credentials;
create policy "integration_credentials_delete_member" on public.integration_credentials for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_integration_credentials_updated_at
  before update on public.integration_credentials
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. integration_logs
-- =============================================================================
create table if not exists public.integration_logs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete cascade,
  level           text not null default 'info' check (level in ('debug','info','warn','error','fatal')),
  event           text not null,
  message         text not null,
  details         jsonb not null default '{}',
  request_id      text,
  duration_ms     integer,
  created_at      timestamptz not null default now()
);

alter table public.integration_logs enable row level security;

create index if not exists integration_logs_workspace_idx
  on public.integration_logs (workspace_id, created_at desc);
create index if not exists integration_logs_integration_idx
  on public.integration_logs (integration_id, created_at desc);
create index if not exists integration_logs_level_idx
  on public.integration_logs (workspace_id, level, created_at desc);

drop policy if exists "integration_logs_select_member" on public.integration_logs;
create policy "integration_logs_select_member" on public.integration_logs for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_logs_insert_member" on public.integration_logs;
create policy "integration_logs_insert_member" on public.integration_logs for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_logs_delete_member" on public.integration_logs;
create policy "integration_logs_delete_member" on public.integration_logs for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 4. integration_events
-- =============================================================================
create table if not exists public.integration_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references public.workspaces (id) on delete cascade,
  source          text not null,
  type            text not null,
  category        text not null default 'internal' check (category in (
                    'internal','external','workflow','ai_employee',
                    'notification','billing','crm','erp','integration'
                  )),
  payload         jsonb not null default '{}',
  metadata        jsonb not null default '{}',
  delivered_to    jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

alter table public.integration_events enable row level security;

create index if not exists integration_events_workspace_idx
  on public.integration_events (workspace_id, created_at desc);
create index if not exists integration_events_source_idx
  on public.integration_events (workspace_id, source, created_at desc);
create index if not exists integration_events_type_idx
  on public.integration_events (workspace_id, type, created_at desc);
create index if not exists integration_events_category_idx
  on public.integration_events (workspace_id, category, created_at desc);

-- Events with NULL workspace_id are system-level events (deliveries, broadcasts).
-- Workspace-scoped events require membership.
drop policy if exists "integration_events_select_member_or_global" on public.integration_events;
create policy "integration_events_select_member_or_global" on public.integration_events for select
  using (
    workspace_id is null
    or public.is_workspace_member(workspace_id, auth.uid())
  );

drop policy if exists "integration_events_insert_member" on public.integration_events;
create policy "integration_events_insert_member" on public.integration_events for insert
  with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id, auth.uid())
  );

drop policy if exists "integration_events_delete_member" on public.integration_events;
create policy "integration_events_delete_member" on public.integration_events for delete
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 5. integration_sync_jobs
-- =============================================================================
create table if not exists public.integration_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  job_type        text not null default 'manual' check (job_type in (
                    'full','incremental','webhook_triggered','manual','scheduled'
                  )),
  status          text not null default 'pending' check (status in (
                    'pending','running','completed','failed','cancelled','retrying'
                  )),
  resource        text,
  direction       text not null default 'pull' check (direction in ('pull','push','bidirectional')),
  trigger         text not null default 'manual' check (trigger in ('manual','scheduled','webhook','event')),
  records_total   integer not null default 0,
  records_synced  integer not null default 0,
  conflicts_count integer not null default 0,
  retry_count     integer not null default 0,
  max_retries     integer not null default 3,
  error           text,
  details         jsonb not null default '{}',
  started_at      timestamptz,
  completed_at    timestamptz,
  next_retry_at   timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.integration_sync_jobs enable row level security;

create index if not exists integration_sync_jobs_workspace_idx
  on public.integration_sync_jobs (workspace_id, created_at desc);
create index if not exists integration_sync_jobs_integration_idx
  on public.integration_sync_jobs (integration_id, created_at desc);
create index if not exists integration_sync_jobs_status_idx
  on public.integration_sync_jobs (workspace_id, status, created_at desc);
create index if not exists integration_sync_jobs_retry_idx
  on public.integration_sync_jobs (status, next_retry_at)
  where status = 'retrying';

drop policy if exists "integration_sync_jobs_select_member" on public.integration_sync_jobs;
create policy "integration_sync_jobs_select_member" on public.integration_sync_jobs for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_sync_jobs_insert_member" on public.integration_sync_jobs;
create policy "integration_sync_jobs_insert_member" on public.integration_sync_jobs for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_sync_jobs_update_member" on public.integration_sync_jobs;
create policy "integration_sync_jobs_update_member" on public.integration_sync_jobs for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_sync_jobs_delete_member" on public.integration_sync_jobs;
create policy "integration_sync_jobs_delete_member" on public.integration_sync_jobs for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_integration_sync_jobs_updated_at
  before update on public.integration_sync_jobs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 6. marketplace_apps
-- =============================================================================
create table if not exists public.marketplace_apps (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  short_name      text,
  tagline         text,
  description     text,
  category        text not null default 'other' check (category in (
                    'ai_provider','communication','email','storage','development',
                    'payments','commerce','automation','crm','productivity',
                    'analytics','social','other'
                  )),
  subcategory     text,
  publisher_id    uuid references auth.users (id) on delete set null,
  publisher_name  text,
  publisher_verified boolean not null default false,
  connector_key   text,
  icon_url        text,
  screenshots     jsonb not null default '[]',
  capabilities    jsonb not null default '[]',
  auth_type       text not null default 'none' check (auth_type in ('oauth2','api_key','basic','webhook','none')),
  required_scopes jsonb not null default '[]',
  config_schema   jsonb not null default '{}',
  install_instructions text,
  privacy_url     text,
  terms_url        text,
  documentation_url text,
  is_published    boolean not null default false,
  is_featured     boolean not null default false,
  is_official     boolean not null default false,
  install_count   integer not null default 0,
  rating_avg      numeric(3,2) not null default 0,
  rating_count    integer not null default 0,
  version         text not null default '1.0.0',
  latest_version_id uuid references public.integration_versions (id) on delete set null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.marketplace_apps enable row level security;

create index if not exists marketplace_apps_slug_idx
  on public.marketplace_apps (slug);
create index if not exists marketplace_apps_published_idx
  on public.marketplace_apps (is_published, category, created_at desc);
create index if not exists marketplace_apps_featured_idx
  on public.marketplace_apps (is_featured, is_published) where is_featured = true;
create index if not exists marketplace_apps_official_idx
  on public.marketplace_apps (is_official, is_published) where is_official = true;
create index if not exists marketplace_apps_category_idx
  on public.marketplace_apps (category, is_published);
create index if not exists marketplace_apps_name_fts_idx
  on public.marketplace_apps using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(tagline,'') || ' ' || coalesce(description,'')));
create index if not exists marketplace_apps_publisher_idx
  on public.marketplace_apps (publisher_id, created_at desc);
create index if not exists marketplace_apps_rating_idx
  on public.marketplace_apps (rating_avg desc, rating_count desc) where is_published = true;

-- Marketplace apps are publicly readable when published.
drop policy if exists "marketplace_apps_select_public" on public.marketplace_apps;
create policy "marketplace_apps_select_public" on public.marketplace_apps for select
  using (is_published = true or publisher_id = auth.uid());

drop policy if exists "marketplace_apps_insert_owner" on public.marketplace_apps;
create policy "marketplace_apps_insert_owner" on public.marketplace_apps for insert
  with check (publisher_id = auth.uid());

drop policy if exists "marketplace_apps_update_owner" on public.marketplace_apps;
create policy "marketplace_apps_update_owner" on public.marketplace_apps for update
  using (publisher_id = auth.uid());

drop policy if exists "marketplace_apps_delete_owner" on public.marketplace_apps;
create policy "marketplace_apps_delete_owner" on public.marketplace_apps for delete
  using (publisher_id = auth.uid());

create trigger if not exists trg_marketplace_apps_updated_at
  before update on public.marketplace_apps
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 7. installed_apps
-- =============================================================================
create table if not exists public.installed_apps (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  app_id         uuid not null references public.marketplace_apps (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete set null,
  status          text not null default 'installed' check (status in (
                    'installed','uninstalled','suspended','update_available'
                  )),
  installed_version text,
  config          jsonb not null default '{}',
  permissions_granted jsonb not null default '[]',
  installed_by    uuid references auth.users (id) on delete set null,
  installed_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, app_id)
);

alter table public.installed_apps enable row level security;

create index if not exists installed_apps_workspace_idx
  on public.installed_apps (workspace_id, installed_at desc);
create index if not exists installed_apps_app_idx
  on public.installed_apps (app_id, status);
create index if not exists installed_apps_integration_idx
  on public.installed_apps (integration_id);

drop policy if exists "installed_apps_select_member" on public.installed_apps;
create policy "installed_apps_select_member" on public.installed_apps for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "installed_apps_insert_member" on public.installed_apps;
create policy "installed_apps_insert_member" on public.installed_apps for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and installed_by = auth.uid());

drop policy if exists "installed_apps_update_member" on public.installed_apps;
create policy "installed_apps_update_member" on public.installed_apps for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "installed_apps_delete_member" on public.installed_apps;
create policy "installed_apps_delete_member" on public.installed_apps for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_installed_apps_updated_at
  before update on public.installed_apps
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 8. app_reviews
-- =============================================================================
create table if not exists public.app_reviews (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.marketplace_apps (id) on delete cascade,
  workspace_id    uuid references public.workspaces (id) on delete set null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  author_name     text,
  title           text,
  body            text,
  is_verified_install boolean not null default false,
  helpful_count   integer not null default 0,
  is_reported     boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (app_id, user_id)
);

alter table public.app_reviews enable row level security;

create index if not exists app_reviews_app_idx
  on public.app_reviews (app_id, created_at desc);
create index if not exists app_reviews_user_idx
  on public.app_reviews (user_id, created_at desc);

-- Reviews are public for published apps; only the author can mutate.
drop policy if exists "app_reviews_select_public" on public.app_reviews;
create policy "app_reviews_select_public" on public.app_reviews for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.marketplace_apps ma
      where ma.id = app_reviews.app_id and ma.is_published = true
    )
  );

drop policy if exists "app_reviews_insert_owner" on public.app_reviews;
create policy "app_reviews_insert_owner" on public.app_reviews for insert
  with check (user_id = auth.uid());

drop policy if exists "app_reviews_update_owner" on public.app_reviews;
create policy "app_reviews_update_owner" on public.app_reviews for update
  using (user_id = auth.uid());

drop policy if exists "app_reviews_delete_owner" on public.app_reviews;
create policy "app_reviews_delete_owner" on public.app_reviews for delete
  using (user_id = auth.uid());

create trigger if not exists trg_app_reviews_updated_at
  before update on public.app_reviews
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 9. app_ratings
-- =============================================================================
create table if not exists public.app_ratings (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.marketplace_apps (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  rating          integer not null check (rating >= 1 and rating <= 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (app_id, user_id)
);

alter table public.app_ratings enable row level security;

create index if not exists app_ratings_app_idx
  on public.app_ratings (app_id, created_at desc);
create index if not exists app_ratings_user_idx
  on public.app_ratings (user_id, created_at desc);

drop policy if exists "app_ratings_select_public" on public.app_ratings;
create policy "app_ratings_select_public" on public.app_ratings for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.marketplace_apps ma
      where ma.id = app_ratings.app_id and ma.is_published = true
    )
  );

drop policy if exists "app_ratings_insert_owner" on public.app_ratings;
create policy "app_ratings_insert_owner" on public.app_ratings for insert
  with check (user_id = auth.uid());

drop policy if exists "app_ratings_update_owner" on public.app_ratings;
create policy "app_ratings_update_owner" on public.app_ratings for update
  using (user_id = auth.uid());

drop policy if exists "app_ratings_delete_owner" on public.app_ratings;
create policy "app_ratings_delete_owner" on public.app_ratings for delete
  using (user_id = auth.uid());

create trigger if not exists trg_app_ratings_updated_at
  before update on public.app_ratings
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 10. webhook_subscriptions
-- =============================================================================
create table if not exists public.webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete cascade,
  url_slug        text not null unique,
  signing_secret  text not null,
  events          jsonb not null default '[]',
  target_url      text,
  is_active       boolean not null default true,
  secret_version  integer not null default 1,
  last_received_at timestamptz,
  total_received  integer not null default 0,
  total_failed    integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.webhook_subscriptions enable row level security;

create index if not exists webhook_subscriptions_workspace_idx
  on public.webhook_subscriptions (workspace_id, created_at desc);
create index if not exists webhook_subscriptions_integration_idx
  on public.webhook_subscriptions (integration_id);
create index if not exists webhook_subscriptions_active_idx
  on public.webhook_subscriptions (is_active) where is_active = true;

drop policy if exists "webhook_subscriptions_select_member" on public.webhook_subscriptions;
create policy "webhook_subscriptions_select_member" on public.webhook_subscriptions for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_subscriptions_insert_member" on public.webhook_subscriptions;
create policy "webhook_subscriptions_insert_member" on public.webhook_subscriptions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and created_by = auth.uid());

drop policy if exists "webhook_subscriptions_update_member" on public.webhook_subscriptions;
create policy "webhook_subscriptions_update_member" on public.webhook_subscriptions for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_subscriptions_delete_member" on public.webhook_subscriptions;
create policy "webhook_subscriptions_delete_member" on public.webhook_subscriptions for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_webhook_subscriptions_updated_at
  before update on public.webhook_subscriptions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 11. webhook_deliveries
-- =============================================================================
create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete cascade,
  subscription_id uuid references public.webhook_subscriptions (id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null default '{}',
  target_url      text,
  http_method     text not null default 'POST',
  status          text not null default 'pending' check (status in (
                    'pending','delivered','failed','retrying'
                  )),
  http_status     integer,
  response_body   text,
  attempt_count   integer not null default 0,
  max_attempts    integer not null default 5,
  next_retry_at   timestamptz,
  duration_ms     integer,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.webhook_deliveries enable row level security;

create index if not exists webhook_deliveries_workspace_idx
  on public.webhook_deliveries (workspace_id, created_at desc);
create index if not exists webhook_deliveries_subscription_idx
  on public.webhook_deliveries (subscription_id, created_at desc);
create index if not exists webhook_deliveries_status_idx
  on public.webhook_deliveries (workspace_id, status, created_at desc);
create index if not exists webhook_deliveries_retry_idx
  on public.webhook_deliveries (status, next_retry_at)
  where status in ('pending','retrying');

drop policy if exists "webhook_deliveries_select_member" on public.webhook_deliveries;
create policy "webhook_deliveries_select_member" on public.webhook_deliveries for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_deliveries_insert_member" on public.webhook_deliveries;
create policy "webhook_deliveries_insert_member" on public.webhook_deliveries for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_deliveries_update_member" on public.webhook_deliveries;
create policy "webhook_deliveries_update_member" on public.webhook_deliveries for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "webhook_deliveries_delete_member" on public.webhook_deliveries;
create policy "webhook_deliveries_delete_member" on public.webhook_deliveries for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_webhook_deliveries_updated_at
  before update on public.webhook_deliveries
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 12. integration_health
-- =============================================================================
create table if not exists public.integration_health (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  status          text not null default 'unknown' check (status in (
                    'healthy','degraded','down','unknown'
                  )),
  latency_ms      integer,
  error_rate      numeric(5,4) not null default 0,
  success_count   integer not null default 0,
  failure_count   integer not null default 0,
  last_check_at   timestamptz not null default now(),
  details         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.integration_health enable row level security;

create index if not exists integration_health_workspace_idx
  on public.integration_health (workspace_id, last_check_at desc);
create index if not exists integration_health_integration_idx
  on public.integration_health (integration_id, last_check_at desc);
create index if not exists integration_health_status_idx
  on public.integration_health (workspace_id, status);

drop policy if exists "integration_health_select_member" on public.integration_health;
create policy "integration_health_select_member" on public.integration_health for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_health_insert_member" on public.integration_health;
create policy "integration_health_insert_member" on public.integration_health for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_health_delete_member" on public.integration_health;
create policy "integration_health_delete_member" on public.integration_health for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 13. integration_permissions
-- =============================================================================
create table if not exists public.integration_permissions (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  scope           text not null,
  granted_by      uuid references auth.users (id) on delete set null,
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz,
  is_active       boolean not null default true,
  unique (integration_id, scope)
);

alter table public.integration_permissions enable row level security;

create index if not exists integration_permissions_integration_idx
  on public.integration_permissions (integration_id, is_active);
create index if not exists integration_permissions_workspace_idx
  on public.integration_permissions (workspace_id, integration_id);

drop policy if exists "integration_permissions_select_member" on public.integration_permissions;
create policy "integration_permissions_select_member" on public.integration_permissions for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_permissions_insert_member" on public.integration_permissions;
create policy "integration_permissions_insert_member" on public.integration_permissions for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and granted_by = auth.uid());

drop policy if exists "integration_permissions_update_member" on public.integration_permissions;
create policy "integration_permissions_update_member" on public.integration_permissions for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_permissions_delete_member" on public.integration_permissions;
create policy "integration_permissions_delete_member" on public.integration_permissions for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================================================
-- 14. integration_versions
-- =============================================================================
create table if not exists public.integration_versions (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.marketplace_apps (id) on delete cascade,
  version         text not null,
  changelog       text,
  is_latest       boolean not null default false,
  is_breaking     boolean not null default false,
  migration_script text,
  published_at    timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (app_id, version)
);

alter table public.integration_versions enable row level security;

create index if not exists integration_versions_app_idx
  on public.integration_versions (app_id, created_at desc);
create index if not exists integration_versions_latest_idx
  on public.integration_versions (app_id, is_latest) where is_latest = true;

drop policy if exists "integration_versions_select_public" on public.integration_versions;
create policy "integration_versions_select_public" on public.integration_versions for select
  using (
    exists (
      select 1 from public.marketplace_apps ma
      where ma.id = integration_versions.app_id
        and (ma.is_published = true or ma.publisher_id = auth.uid())
    )
  );

drop policy if exists "integration_versions_insert_owner" on public.integration_versions;
create policy "integration_versions_insert_owner" on public.integration_versions for insert
  with check (
    exists (
      select 1 from public.marketplace_apps ma
      where ma.id = integration_versions.app_id and ma.publisher_id = auth.uid()
    )
  );

drop policy if exists "integration_versions_update_owner" on public.integration_versions;
create policy "integration_versions_update_owner" on public.integration_versions for update
  using (
    exists (
      select 1 from public.marketplace_apps ma
      where ma.id = integration_versions.app_id and ma.publisher_id = auth.uid()
    )
  );

drop policy if exists "integration_versions_delete_owner" on public.integration_versions;
create policy "integration_versions_delete_owner" on public.integration_versions for delete
  using (
    exists (
      select 1 from public.marketplace_apps ma
      where ma.id = integration_versions.app_id and ma.publisher_id = auth.uid()
    )
  );

-- =============================================================================
-- 15. integration_analytics
-- =============================================================================
create table if not exists public.integration_analytics (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  metric_date     date not null default current_date,
  api_calls       integer not null default 0,
  api_errors      integer not null default 0,
  avg_latency_ms  integer,
  p99_latency_ms  integer,
  sync_runs       integer not null default 0,
  records_synced  integer not null default 0,
  webhooks_received integer not null default 0,
  webhooks_delivered integer not null default 0,
  rate_limit_hits integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (integration_id, metric_date)
);

alter table public.integration_analytics enable row level security;

create index if not exists integration_analytics_workspace_idx
  on public.integration_analytics (workspace_id, metric_date desc);
create index if not exists integration_analytics_integration_idx
  on public.integration_analytics (integration_id, metric_date desc);

drop policy if exists "integration_analytics_select_member" on public.integration_analytics;
create policy "integration_analytics_select_member" on public.integration_analytics for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_analytics_insert_member" on public.integration_analytics;
create policy "integration_analytics_insert_member" on public.integration_analytics for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_analytics_update_member" on public.integration_analytics;
create policy "integration_analytics_update_member" on public.integration_analytics for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "integration_analytics_delete_member" on public.integration_analytics;
create policy "integration_analytics_delete_member" on public.integration_analytics for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

create trigger if not exists trg_integration_analytics_updated_at
  before update on public.integration_analytics
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Seed: marketplace_apps (official published connectors)
-- =============================================================================
insert into public.marketplace_apps (
  slug, name, short_name, tagline, description, category, subcategory,
  publisher_name, publisher_verified, connector_key, capabilities, auth_type,
  required_scopes, config_schema, install_instructions, is_published, is_featured,
  is_official, version
) values
  ('openai', 'OpenAI', 'OpenAI', 'GPT-4o, o1, DALL·E, Whisper',
   'Connect to OpenAI for chat completions, embeddings, image generation, and transcription.',
   'ai_provider', 'chat', 'Supa AI', true, 'openai',
   '["chat","embeddings","images","transcription"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your OpenAI API key on the connect screen.',
   true, true, true, '1.0.0'),
  ('anthropic', 'Anthropic', 'Anthropic', 'Claude 3.5 Sonnet & Opus',
   'Connect to Anthropic for Claude chat completions and embeddings.',
   'ai_provider', 'chat', 'Supa AI', true, 'anthropic',
   '["chat","embeddings"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Anthropic API key on the connect screen.',
   true, true, true, '1.0.0'),
  ('google-ai', 'Google AI', 'Gemini', 'Gemini 1.5 Pro & Flash',
   'Connect to Google Generative AI for Gemini chat and image generation.',
   'ai_provider', 'chat', 'Supa AI', true, 'gemini',
   '["chat","images"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Google Generative AI API key on the connect screen.',
   true, true, true, '1.0.0'),
  ('openrouter', 'OpenRouter', 'OpenRouter', 'Unified gateway to 200+ LLMs',
   'Connect to OpenRouter for unified access to hundreds of models.',
   'ai_provider', 'gateway', 'Supa AI', true, 'openrouter',
   '["chat"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your OpenRouter API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('deepseek', 'DeepSeek', 'DeepSeek', 'DeepSeek V3 / R1 reasoning',
   'Connect to DeepSeek for cost-effective reasoning and chat.',
   'ai_provider', 'chat', 'Supa AI', true, 'deepseek',
   '["chat"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your DeepSeek API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('qwen', 'Qwen', 'Qwen', 'Alibaba Qwen 2.5',
   'Connect to Alibaba Qwen for multilingual chat and multimodal AI.',
   'ai_provider', 'chat', 'Supa AI', true, 'qwen',
   '["chat"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Qwen API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('grok', 'Grok', 'Grok', 'xAI Grok 2',
   'Connect to xAI Grok for chat completions.',
   'ai_provider', 'chat', 'Supa AI', true, 'grok',
   '["chat"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your xAI Grok API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('slack', 'Slack', 'Slack', 'Chat, channels, messages',
   'Connect Slack to send and receive messages, manage channels, and trigger workflows on Slack events.',
   'communication', 'team-chat', 'Supa AI', true, 'slack',
   '["messages","channels","files"]'::jsonb, 'oauth2',
   '["chat:write","channels:read","channels:history"]'::jsonb, '{}'::jsonb,
   'Authorize your Slack workspace on the connect screen.',
   true, true, true, '1.0.0'),
  ('whatsapp', 'WhatsApp', 'WhatsApp', 'WhatsApp Business messaging',
   'Connect WhatsApp Business to send and receive messages.',
   'communication', 'messaging', 'Supa AI', true, 'whatsapp',
   '["messages"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your WhatsApp Business API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('telegram', 'Telegram', 'Telegram', 'Telegram bot API',
   'Connect Telegram to send messages via your bot.',
   'communication', 'messaging', 'Supa AI', true, 'telegram',
   '["messages"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Telegram bot token on the connect screen.',
   true, false, true, '1.0.0'),
  ('discord', 'Discord', 'Discord', 'Servers, channels, messages',
   'Connect Discord to send messages and manage your server.',
   'communication', 'community', 'Supa AI', true, 'discord',
   '["messages","guilds"]'::jsonb, 'oauth2',
   '["bot","messages.read"]'::jsonb, '{}'::jsonb,
   'Authorize your Discord bot on the connect screen.',
   true, false, true, '1.0.0'),
  ('microsoft-teams', 'Microsoft Teams', 'MS Teams', 'Teams chat & channels',
   'Connect Microsoft Teams to send messages and channel updates.',
   'communication', 'team-chat', 'Supa AI', true, 'microsoft-teams',
   '["messages","channels"]'::jsonb, 'oauth2',
   '["ChannelMessage.Send"]'::jsonb, '{}'::jsonb,
   'Authorize your Microsoft 365 tenant on the connect screen.',
   true, false, true, '1.0.0'),
  ('zoom', 'Zoom', 'Zoom', 'Meetings, webinars, recordings',
   'Connect Zoom to manage meetings and webinars.',
   'communication', 'video', 'Supa AI', true, 'zoom',
   '["meetings","recordings"]'::jsonb, 'oauth2',
   '["meeting:write","recording:write"]'::jsonb, '{}'::jsonb,
   'Authorize your Zoom account on the connect screen.',
   true, false, true, '1.0.0'),
  ('gmail', 'Gmail', 'Gmail', 'Send & receive email via Gmail',
   'Connect Gmail to send and receive email programmatically.',
   'email', 'email-client', 'Supa AI', true, 'gmail',
   '["send","receive","labels"]'::jsonb, 'oauth2',
   '["gmail.send","gmail.readonly"]'::jsonb, '{}'::jsonb,
   'Authorize your Google account on the connect screen.',
   true, true, true, '1.0.0'),
  ('outlook', 'Outlook', 'Outlook', 'Microsoft 365 email',
   'Connect Outlook to send and receive email via Microsoft Graph.',
   'email', 'email-client', 'Supa AI', true, 'outlook',
   '["send","receive"]'::jsonb, 'oauth2',
   '["Mail.Send","Mail.Read"]'::jsonb, '{}'::jsonb,
   'Authorize your Microsoft 365 account on the connect screen.',
   true, false, true, '1.0.0'),
  ('google-drive', 'Google Drive', 'Drive', 'Files, folders, sharing',
   'Connect Google Drive to upload, share, and search files.',
   'storage', 'cloud-storage', 'Supa AI', true, 'google-drive',
   '["files","folders"]'::jsonb, 'oauth2',
   '["drive.file","drive.metadata"]'::jsonb, '{}'::jsonb,
   'Authorize your Google account on the connect screen.',
   true, true, true, '1.0.0'),
  ('dropbox', 'Dropbox', 'Dropbox', 'Cloud file storage',
   'Connect Dropbox to manage files and folders.',
   'storage', 'cloud-storage', 'Supa AI', true, 'dropbox',
   '["files","folders"]'::jsonb, 'oauth2',
   '["files.content.read","files.content.write"]'::jsonb, '{}'::jsonb,
   'Authorize your Dropbox account on the connect screen.',
   true, false, true, '1.0.0'),
  ('onedrive', 'OneDrive', 'OneDrive', 'Microsoft cloud storage',
   'Connect OneDrive to manage files and folders.',
   'storage', 'cloud-storage', 'Supa AI', true, 'onedrive',
   '["files","folders"]'::jsonb, 'oauth2',
   '["Files.Read","Files.ReadWrite"]'::jsonb, '{}'::jsonb,
   'Authorize your Microsoft 365 account on the connect screen.',
   true, false, true, '1.0.0'),
  ('github', 'GitHub', 'GitHub', 'Repos, issues, PRs, actions',
   'Connect GitHub to manage repositories, issues, pull requests, and actions.',
   'development', 'devops', 'Supa AI', true, 'github',
   '["repos","issues","pulls","actions"]'::jsonb, 'oauth2',
   '["repo","workflow"]'::jsonb, '{}'::jsonb,
   'Authorize your GitHub account on the connect screen.',
   true, true, true, '1.0.0'),
  ('stripe', 'Stripe', 'Stripe', 'Payments, customers, subscriptions',
   'Connect Stripe to accept payments and manage subscriptions.',
   'payments', 'payments', 'Supa AI', true, 'stripe',
   '["payments","customers","subscriptions"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Stripe secret key on the connect screen.',
   true, true, true, '1.0.0'),
  ('paystack', 'Paystack', 'Paystack', 'African payments',
   'Connect Paystack to accept payments across Africa.',
   'payments', 'payments', 'Supa AI', true, 'paystack',
   '["payments"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Paystack secret key on the connect screen.',
   true, false, true, '1.0.0'),
  ('flutterwave', 'Flutterwave', 'Flutterwave', 'Pan-African payments',
   'Connect Flutterwave to accept payments across Africa.',
   'payments', 'payments', 'Supa AI', true, 'flutterwave',
   '["payments"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Flutterwave secret key on the connect screen.',
   true, false, true, '1.0.0'),
  ('shopify', 'Shopify', 'Shopify', 'E-commerce, orders, products',
   'Connect Shopify to manage products and orders.',
   'commerce', 'ecommerce', 'Supa AI', true, 'shopify',
   '["orders","products","customers"]'::jsonb, 'oauth2',
   '["read_products","write_products","read_orders"]'::jsonb, '{}'::jsonb,
   'Authorize your Shopify store on the connect screen.',
   true, false, true, '1.0.0'),
  ('woocommerce', 'WooCommerce', 'WooCommerce', 'WordPress e-commerce',
   'Connect WooCommerce to manage products and orders.',
   'commerce', 'ecommerce', 'Supa AI', true, 'woocommerce',
   '["orders","products"]'::jsonb, 'basic',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your WooCommerce REST credentials on the connect screen.',
   true, false, true, '1.0.0'),
  ('zapier', 'Zapier', 'Zapier', '2000+ app automations',
   'Connect Zapier to trigger workflows across thousands of apps.',
   'automation', 'automation', 'Supa AI', true, 'zapier',
   '["triggers","actions"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Zapier webhook URL on the connect screen.',
   true, false, true, '1.0.0'),
  ('make', 'Make', 'Make', 'Visual automation scenarios',
   'Connect Make (Integromat) to build visual automation scenarios.',
   'automation', 'automation', 'Supa AI', true, 'make',
   '["scenarios","webhooks"]'::jsonb, 'api_key',
   '[]'::jsonb, '{}'::jsonb,
   'Provide your Make API key on the connect screen.',
   true, false, true, '1.0.0'),
  ('google-oauth', 'Google', 'Google', 'OAuth for Google services',
   'Connect your Google account once for all Google services (Gmail, Calendar, Drive).',
   'productivity', 'oauth', 'Supa AI', true, 'google-oauth',
   '["oauth"]'::jsonb, 'oauth2',
   '["openid","email","profile"]'::jsonb, '{}'::jsonb,
   'Authorize your Google account on the connect screen.',
   true, true, true, '1.0.0'),
  ('google-calendar', 'Google Calendar', 'Calendar', 'Calendar events',
   'Connect Google Calendar to manage events and reminders.',
   'productivity', 'calendar', 'Supa AI', true, 'google-calendar',
   '["events","calendars"]'::jsonb, 'oauth2',
   '["calendar.events"]'::jsonb, '{}'::jsonb,
   'Authorize your Google account on the connect screen.',
   true, false, true, '1.0.0')
on conflict (slug) do nothing;
