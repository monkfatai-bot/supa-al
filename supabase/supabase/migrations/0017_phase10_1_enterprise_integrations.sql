-- =============================================================================
-- SUPA AI — 0017_phase10_1_enterprise_integrations.sql
-- Phase 10.1: Enterprise Integration Hub Addendum
--
-- Tables (11):
--   1.  integration_capabilities       — central capability registry
--   2.  workspace_integration_settings — per-workspace enable/disable + access
--   3.  oauth_lifecycle_events         — token refresh/expiry/revocation audit
--   4.  webhook_dead_letter_queue      — DLQ for unrecoverable webhook deliveries
--   5.  webhook_idempotency            — duplicate detection (idempotency keys)
--   6.  integration_health_scores      — weighted health score snapshots
--   7.  integration_usage_metrics      — granular per-request metrics
--   8.  publisher_verifications        — marketplace publisher verification
--   9.  extension_lifecycles           — install/update/rollback/disable/enable
--  10.  compatibility_checks           — version compatibility validation log
--  11.  developer_sdks                 — SDK manifest registry for developers
-- =============================================================================

-- 1. integration_capabilities — central capability catalog
create table if not exists public.integration_capabilities (
  id              uuid primary key default gen_random_uuid(),
  capability_key  text not null unique,
  label           text not null,
  description     text,
  category        text not null check (category in ('communication','ai','storage','payments','crm','erp','productivity','automation','webhook','search','security','other')),
  input_schema    jsonb not null default '{}',
  output_schema   jsonb not null default '{}',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.integration_capabilities enable row level security;
create index if not exists integ_cap_key_idx on public.integration_capabilities (capability_key);
create index if not exists integ_cap_category_idx on public.integration_capabilities (category, is_active);
drop policy if exists "integ_caps_read" on public.integration_capabilities;
create policy "integ_caps_read" on public.integration_capabilities for select
  using (auth.role() = 'authenticated');

-- 2. workspace_integration_settings — per-workspace enable/disable + access control
create table if not exists public.workspace_integration_settings (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  is_enabled      boolean not null default true,
  access_mode     text not null default 'full' check (access_mode in ('read_only','full','disabled')),
  allowed_user_ids jsonb not null default '[]',
  allowed_departments jsonb not null default '[]',
  allowed_employee_ids jsonb not null default '[]',
  allowed_workflow_ids jsonb not null default '[]',
  config_overrides jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, integration_id)
);
alter table public.workspace_integration_settings enable row level security;
create index if not exists ws_integ_settings_ws_idx on public.workspace_integration_settings (workspace_id, is_enabled);
drop policy if exists "ws_integ_settings_ws" on public.workspace_integration_settings;
create policy "ws_integ_settings_ws" on public.workspace_integration_settings for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "ws_integ_settings_ws_w" on public.workspace_integration_settings;
create policy "ws_integ_settings_ws_w" on public.workspace_integration_settings for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "ws_integ_settings_ws_u" on public.workspace_integration_settings;
create policy "ws_integ_settings_ws_u" on public.workspace_integration_settings for update
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "ws_integ_settings_ws_d" on public.workspace_integration_settings;
create policy "ws_integ_settings_ws_d" on public.workspace_integration_settings for delete
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 3. oauth_lifecycle_events — token refresh/expiry/revocation audit trail
create table if not exists public.oauth_lifecycle_events (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  event_type      text not null check (event_type in ('token_refreshed','token_expired','token_revoked','reauthentication_required','refresh_failed','token_expiring_soon','auto_refresh_success','auto_refresh_failed')),
  status          text not null check (status in ('success','failed','pending')),
  expires_at      timestamptz,
  error_message   text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
alter table public.oauth_lifecycle_events enable row level security;
create index if not exists oauth_life_ws_idx on public.oauth_lifecycle_events (workspace_id, created_at desc);
create index if not exists oauth_life_integ_idx on public.oauth_lifecycle_events (integration_id, created_at desc);
drop policy if exists "oauth_life_ws" on public.oauth_lifecycle_events;
create policy "oauth_life_ws" on public.oauth_lifecycle_events for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "oauth_life_ws_w" on public.oauth_lifecycle_events;
create policy "oauth_life_ws_w" on public.oauth_lifecycle_events for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

-- 4. webhook_dead_letter_queue — unrecoverable webhook deliveries
create table if not exists public.webhook_dead_letter_queue (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete cascade,
  subscription_id uuid references public.webhook_subscriptions (id) on delete cascade,
  delivery_id     uuid references public.webhook_deliveries (id) on delete set null,
  event_type      text not null,
  payload         jsonb not null default '{}',
  target_url      text not null,
  failure_reason  text not null,
  attempt_count   integer not null default 0,
  max_attempts    integer not null default 5,
  last_attempt_at timestamptz,
  is_replayed     boolean not null default false,
  replayed_at     timestamptz,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
alter table public.webhook_dead_letter_queue enable row level security;
create index if not exists webhook_dlq_ws_idx on public.webhook_dead_letter_queue (workspace_id, created_at desc);
create index if not exists webhook_dlq_unreplayed_idx on public.webhook_dead_letter_queue (workspace_id) where is_replayed = false;
drop policy if exists "webhook_dlq_ws" on public.webhook_dead_letter_queue;
create policy "webhook_dlq_ws" on public.webhook_dead_letter_queue for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "webhook_dlq_ws_w" on public.webhook_dead_letter_queue;
create policy "webhook_dlq_ws_w" on public.webhook_dead_letter_queue for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "webhook_dlq_ws_u" on public.webhook_dead_letter_queue;
create policy "webhook_dlq_ws_u" on public.webhook_dead_letter_queue for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 5. webhook_idempotency — duplicate detection
create table if not exists public.webhook_idempotency (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  subscription_id uuid references public.webhook_subscriptions (id) on delete cascade,
  idempotency_key text not null,
  event_type      text,
  payload_hash    text not null,
  processed_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (subscription_id, idempotency_key)
);
alter table public.webhook_idempotency enable row level security;
create index if not exists webhook_idem_sub_key_idx on public.webhook_idempotency (subscription_id, idempotency_key);
create index if not exists webhook_idem_ws_idx on public.webhook_idempotency (workspace_id, created_at desc);
drop policy if exists "webhook_idem_ws" on public.webhook_idempotency;
create policy "webhook_idem_ws" on public.webhook_idempotency for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "webhook_idem_ws_w" on public.webhook_idempotency;
create policy "webhook_idem_ws_w" on public.webhook_idempotency for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

-- 6. integration_health_scores — weighted health score snapshots
create table if not exists public.integration_health_scores (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  overall_score   integer not null check (overall_score >= 0 and overall_score <= 100),
  status          text not null check (status in ('healthy','warning','critical')),
  availability_score integer not null check (availability_score >= 0 and availability_score <= 100),
  auth_score      integer not null check (auth_score >= 0 and auth_score <= 100),
  latency_score   integer not null check (latency_score >= 0 and latency_score <= 100),
  error_rate_score integer not null check (error_rate_score >= 0 and error_rate_score <= 100),
  rate_limit_score integer not null check (rate_limit_score >= 0 and rate_limit_score <= 100),
  sync_score      integer not null check (sync_score >= 0 and sync_score <= 100),
  oauth_score     integer not null check (oauth_score >= 0 and oauth_score <= 100),
  webhook_score   integer not null check (webhook_score >= 0 and webhook_score <= 100),
  details         jsonb not null default '{}',
  computed_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
alter table public.integration_health_scores enable row level security;
create index if not exists health_scores_ws_idx on public.integration_health_scores (workspace_id, created_at desc);
create index if not exists health_scores_integ_idx on public.integration_health_scores (integration_id, created_at desc);
drop policy if exists "health_scores_ws" on public.integration_health_scores;
create policy "health_scores_ws" on public.integration_health_scores for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "health_scores_ws_w" on public.integration_health_scores;
create policy "health_scores_ws_w" on public.integration_health_scores for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));

-- 7. integration_usage_metrics — granular per-request metrics
create table if not exists public.integration_usage_metrics (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  integration_id  uuid not null references public.integrations (id) on delete cascade,
  metric_date     date not null,
  api_requests    integer not null default 0,
  failed_requests integer not null default 0,
  success_rate    numeric(5,4) not null default 1.0 check (success_rate >= 0 and success_rate <= 1),
  avg_response_ms integer not null default 0,
  p95_response_ms integer not null default 0,
  p99_response_ms integer not null default 0,
  credits_consumed integer not null default 0,
  tokens_consumed bigint not null default 0,
  ai_requests     integer not null default 0,
  webhook_traffic integer not null default 0,
  sync_frequency  integer not null default 0,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (integration_id, metric_date)
);
alter table public.integration_usage_metrics enable row level security;
create index if not exists usage_metrics_ws_date_idx on public.integration_usage_metrics (workspace_id, metric_date desc);
drop policy if exists "usage_metrics_ws" on public.integration_usage_metrics;
create policy "usage_metrics_ws" on public.integration_usage_metrics for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "usage_metrics_ws_w" on public.integration_usage_metrics;
create policy "usage_metrics_ws_w" on public.integration_usage_metrics for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "usage_metrics_ws_u" on public.integration_usage_metrics;
create policy "usage_metrics_ws_u" on public.integration_usage_metrics for update
  using (public.is_workspace_member(workspace_id, auth.uid()));

-- 8. publisher_verifications — marketplace publisher verification
create table if not exists public.publisher_verifications (
  id              uuid primary key default gen_random_uuid(),
  publisher_id    uuid not null references auth.users (id) on delete cascade,
  publisher_name  text not null,
  organization_name text,
  organization_url text,
  verification_status text not null default 'pending' check (verification_status in ('pending','under_review','verified','rejected','revoked')),
  verified_at     timestamptz,
  verified_by     uuid references auth.users (id) on delete set null,
  security_review_status text not null default 'pending' check (security_review_status in ('pending','passed','failed','waived')),
  security_reviewed_at timestamptz,
  security_reviewed_by uuid references auth.users (id) on delete set null,
  security_notes  text,
  rating_avg      numeric(3,2) not null default 0 check (rating_avg >= 0 and rating_avg <= 5),
  rating_count    integer not null default 0,
  total_installs  integer not null default 0,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (publisher_id)
);
alter table public.publisher_verifications enable row level security;
create index if not exists pub_verif_publisher_idx on public.publisher_verifications (publisher_id);
create index if not exists pub_verif_status_idx on public.publisher_verifications (verification_status);
drop policy if exists "pub_verif_public_read" on public.publisher_verifications;
create policy "pub_verif_public_read" on public.publisher_verifications for select
  using (true);
drop policy if exists "pub_verif_self_write" on public.publisher_verifications;
create policy "pub_verif_self_write" on public.publisher_verifications for insert
  with check (publisher_id = auth.uid());
drop policy if exists "pub_verif_self_update" on public.publisher_verifications;
create policy "pub_verif_self_update" on public.publisher_verifications for update
  using (publisher_id = auth.uid() or auth.uid() in (select id from public.users where platform_role in ('super_admin','admin')));

-- 9. extension_lifecycles — install/update/rollback/disable/enable/uninstall tracking
create table if not exists public.extension_lifecycles (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  installed_app_id uuid not null references public.installed_apps (id) on delete cascade,
  integration_id  uuid references public.integrations (id) on delete set null,
  action          text not null check (action in ('install','update','rollback','disable','enable','uninstall','version_pin','version_unpin')),
  from_version    text,
  to_version      text,
  pinned_version  text,
  reason          text,
  performed_by    uuid not null references auth.users (id) on delete set null,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
alter table public.extension_lifecycles enable row level security;
create index if not exists ext_life_ws_idx on public.extension_lifecycles (workspace_id, created_at desc);
drop policy if exists "ext_life_ws" on public.extension_lifecycles;
create policy "ext_life_ws" on public.extension_lifecycles for select
  using (public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "ext_life_ws_w" on public.extension_lifecycles;
create policy "ext_life_ws_w" on public.extension_lifecycles for insert
  with check (public.is_workspace_member(workspace_id, auth.uid()) and performed_by = auth.uid());

-- 10. compatibility_checks — version compatibility validation log
create table if not exists public.compatibility_checks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid references public.workspaces (id) on delete cascade,
  app_id          uuid references public.marketplace_apps (id) on delete set null,
  installed_app_id uuid references public.installed_apps (id) on delete set null,
  check_type      text not null check (check_type in ('platform_version','database_version','api_version','sdk_version','dependency_compatibility')),
  required_version text not null,
  actual_version  text not null,
  is_compatible   boolean not null,
  details         jsonb not null default '{}',
  checked_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
alter table public.compatibility_checks enable row level security;
create index if not exists compat_checks_ws_idx on public.compatibility_checks (workspace_id, created_at desc);
drop policy if exists "compat_checks_ws" on public.compatibility_checks;
create policy "compat_checks_ws" on public.compatibility_checks for select
  using (workspace_id is null or public.is_workspace_member(workspace_id, auth.uid()));
drop policy if exists "compat_checks_ws_w" on public.compatibility_checks;
create policy "compat_checks_ws_w" on public.compatibility_checks for insert
  with check (workspace_id is null or public.is_workspace_member(workspace_id, auth.uid()));

-- 11. developer_sdks — SDK manifest registry for developers
create table if not exists public.developer_sdks (
  id              uuid primary key default gen_random_uuid(),
  sdk_key         text not null unique,
  name            text not null,
  version         text not null,
  description     text,
  sdk_type        text not null check (sdk_type in ('integration','workflow_node','ai_employee','business_module','marketplace_app')),
  manifest        jsonb not null default '{}',
  download_url    text,
  documentation_url text,
  is_published    boolean not null default false,
  is_official     boolean not null default false,
  publisher_id    uuid references auth.users (id) on delete set null,
  publisher_name  text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.developer_sdks enable row level security;
create index if not exists dev_sdks_key_idx on public.developer_sdks (sdk_key);
create index if not exists dev_sdks_type_idx on public.developer_sdks (sdk_type, is_published);
create index if not exists dev_sdks_name_fts_idx on public.developer_sdks using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));
drop policy if exists "dev_sdks_public_read" on public.developer_sdks;
create policy "dev_sdks_public_read" on public.developer_sdks for select
  using (is_published = true or publisher_id = auth.uid());
drop policy if exists "dev_sdks_publisher_write" on public.developer_sdks;
create policy "dev_sdks_publisher_write" on public.developer_sdks for insert
  with check (publisher_id = auth.uid());
drop policy if exists "dev_sdks_publisher_update" on public.developer_sdks;
create policy "dev_sdks_publisher_update" on public.developer_sdks for update
  using (publisher_id = auth.uid());
drop policy if exists "dev_sdks_publisher_delete" on public.developer_sdks;
create policy "dev_sdks_publisher_delete" on public.developer_sdks for delete
  using (publisher_id = auth.uid());

-- Attach updated_at triggers to all Phase 10.1 mutable tables
do $$ declare t text; begin
  foreach t in array array[
    'integration_capabilities','workspace_integration_settings','oauth_lifecycle_events',
    'webhook_dead_letter_queue','webhook_idempotency','integration_health_scores',
    'integration_usage_metrics','publisher_verifications','extension_lifecycles',
    'compatibility_checks','developer_sdks'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();', t);
  end loop;
end; $$;

-- Seed default capabilities (idempotent)
insert into public.integration_capabilities (capability_key, label, description, category) values
  ('send_email', 'Send Email', 'Send email messages through an email provider', 'communication'),
  ('send_notification', 'Send Notification', 'Push notifications to messaging platforms', 'communication'),
  ('calendar_read', 'Calendar Read', 'Read calendar events and schedules', 'productivity'),
  ('calendar_write', 'Calendar Write', 'Create, update, delete calendar events', 'productivity'),
  ('file_upload', 'File Upload', 'Upload files to external storage', 'storage'),
  ('file_download', 'File Download', 'Download files from external storage', 'storage'),
  ('chat_completion', 'Chat Completion', 'Generate text via AI chat models', 'ai'),
  ('image_generation', 'Image Generation', 'Generate images from text prompts', 'ai'),
  ('payment_processing', 'Payment Processing', 'Process payments and manage transactions', 'payments'),
  ('crm_read', 'CRM Read', 'Read customer and contact data', 'crm'),
  ('crm_write', 'CRM Write', 'Create and update customer records', 'crm'),
  ('webhook_support', 'Webhook Support', 'Send and receive webhooks', 'webhook'),
  ('search', 'Search', 'Search across external content', 'search'),
  ('ai_function_calling', 'AI Function Calling', 'Call functions/tools via AI models', 'ai')
on conflict (capability_key) do nothing;
