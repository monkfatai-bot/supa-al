-- Migration 018: Phase 10.1 — Enterprise Integration Hub Addendum
-- Categories 13-23: Capability Registry, Permissions, OAuth Lifecycle,
-- Webhook Reliability, Health Score, Analytics, Publisher Verification,
-- Extension Lifecycle, Compatibility, SDK, AI Intelligence

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 13: Integration Capability Registry
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.integration_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- general, ai, communication, storage, payment, crm, calendar, workflow
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Junction: integration → capabilities (many-to-many)
CREATE TABLE IF NOT EXISTS public.integration_capabilities_map (
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  capability_id UUID NOT NULL REFERENCES public.integration_capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (integration_id, capability_id)
);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 14: Workspace Integration Permissions (extended)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'full' CHECK (access_mode IN ('read_only', 'full'));
ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS department_ids UUID[] DEFAULT '{}';
ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS user_ids UUID[] DEFAULT '{}';
ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS ai_employee_access BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS workflow_access BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.integration_permissions ADD COLUMN IF NOT EXISTS scope TEXT[] DEFAULT '{}'; -- e.g. '{read,write,admin}'

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 15: OAuth Lifecycle Audit
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.oauth_token_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('refresh', 'expired_detected', 'revoked', 'reauthenticated', 'refresh_failed', 'expiration_alert')),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_token_audit_account ON public.oauth_token_audit(account_id);
CREATE INDEX IF NOT EXISTS idx_oauth_token_audit_workspace ON public.oauth_token_audit(workspace_id);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 16: Webhook Reliability (extended)
-- ═══════════════════════════════════════════════════════════════

-- Dead Letter Queue
CREATE TABLE IF NOT EXISTS public.webhook_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.webhook_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  last_response_status INT,
  last_error TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  original_event_id UUID, -- for replay tracking
  status TEXT NOT NULL DEFAULT 'dead' CHECK (status IN ('dead', 'replaying', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Duplicate detection
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_webhook ON public.webhook_dead_letters(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_dead_letters_workspace ON public.webhook_dead_letters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_idempotency ON public.webhook_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 17: Integration Health Score
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.integration_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.integration_accounts(id) ON DELETE CASCADE,
  overall_score SMALLINT NOT NULL DEFAULT 100 CHECK (overall_score BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'warning', 'critical')),
  availability_score SMALLINT DEFAULT 100,
  auth_score SMALLINT DEFAULT 100,
  latency_score SMALLINT DEFAULT 100,
  error_rate_score SMALLINT DEFAULT 100,
  rate_limit_score SMALLINT DEFAULT 100,
  sync_score SMALLINT DEFAULT 100,
  oauth_score SMALLINT DEFAULT 100,
  webhook_score SMALLINT DEFAULT 100,
  factors JSONB DEFAULT '{}', -- detailed breakdown
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, integration_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_health_scores_workspace ON public.integration_health_scores(workspace_id);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 18: Integration Analytics (extended)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.integration_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.integration_accounts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  api_requests INT NOT NULL DEFAULT 0,
  failed_requests INT NOT NULL DEFAULT 0,
  total_response_ms BIGINT NOT NULL DEFAULT 0,
  credits_consumed DECIMAL(12,2) DEFAULT 0,
  tokens_consumed INT NOT NULL DEFAULT 0,
  ai_requests INT NOT NULL DEFAULT 0,
  webhook_sent INT NOT NULL DEFAULT 0,
  webhook_received INT NOT NULL DEFAULT 0,
  sync_count INT NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, integration_id, account_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_date ON public.integration_usage_metrics(date);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_workspace ON public.integration_usage_metrics(workspace_id, integration_id);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 19: Marketplace Publisher Verification
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.marketplace_publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT,
  logo_url TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  verification_date TIMESTAMPTZ,
  rating DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  total_installs INT DEFAULT 0,
  total_items INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Link marketplace items to publishers
ALTER TABLE public.marketplace_items ADD COLUMN IF NOT EXISTS publisher_id UUID REFERENCES public.marketplace_publishers(id) ON DELETE SET NULL;

-- Publisher verification requests
CREATE TABLE IF NOT EXISTS public.publisher_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID NOT NULL REFERENCES public.marketplace_publishers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  rejection_reason TEXT,
  evidence JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_publisher_verification ON public.publisher_verification_requests(publisher_id);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 20: Extension Lifecycle (extended)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS pinned_version TEXT;
ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS previous_version TEXT;
ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
ALTER TABLE public.installed_extensions ADD COLUMN IF NOT EXISTS rollback_count INT DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 21: Compatibility Manager
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.platform_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL UNIQUE, -- 'platform', 'database', 'api', 'sdk'
  version TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.extension_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'integration', -- 'integration', 'extension', 'platform', 'sdk'
  dependency_ref TEXT NOT NULL, -- slug, version constraint, or component name
  min_version TEXT,
  max_version TEXT,
  UNIQUE(item_id, dependency_type, dependency_ref)
);

CREATE INDEX IF NOT EXISTS idx_extension_deps_item ON public.extension_dependencies(item_id);

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 22: Developer SDK
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS manifest JSONB DEFAULT '{}';
ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS permission_declarations JSONB DEFAULT '[]';
ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS capability_requirements TEXT[] DEFAULT '{}';
ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS compatibility TEXT[] DEFAULT '{}';
ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS checksum_algorithm TEXT DEFAULT 'sha256';
ALTER TABLE public.sdk_packages ADD COLUMN IF NOT EXISTS total_size_bytes BIGINT DEFAULT 0;

-- ═══════════════════════════════════════════════════════════════
-- CATEGORY 23: AI Integration Intelligence
-- ═══════════════════════════════════════════════════════════════

-- Provider capability matrix cache for AI reasoning
CREATE TABLE IF NOT EXISTS public.ai_provider_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  capability_slug TEXT NOT NULL,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 0, -- lower = higher priority
  is_fallback BOOLEAN NOT NULL DEFAULT false,
 confidence_score DECIMAL(3,2) DEFAULT 1.0,
  usage_count INT NOT NULL DEFAULT 0,
  success_count INT NOT NULL DEFAULT 0,
  avg_response_ms INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  UNIQUE(workspace_id, capability_slug, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_workspace ON public.ai_provider_recommendations(workspace_id, capability_slug);

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Capabilities
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.integration_capabilities (name, slug, description, category) VALUES
  ('Send Email', 'send-email', 'Send outbound emails', 'communication'),
  ('Send Notification', 'send-notification', 'Push notifications and alerts', 'communication'),
  ('Calendar Read', 'calendar-read', 'Read calendar events and availability', 'calendar'),
  ('Calendar Write', 'calendar-write', 'Create, update, and delete calendar events', 'calendar'),
  ('File Upload', 'file-upload', 'Upload files to cloud storage', 'storage'),
  ('File Download', 'file-download', 'Download files from cloud storage', 'storage'),
  ('Chat Completion', 'chat-completion', 'Generate AI chat responses', 'ai'),
  ('Image Generation', 'image-generation', 'Generate images from text prompts', 'ai'),
  ('Payment Processing', 'payment-processing', 'Process payments and refunds', 'payment'),
  ('CRM Read', 'crm-read', 'Read CRM contacts, leads, and deals', 'crm'),
  ('CRM Write', 'crm-write', 'Create and update CRM records', 'crm'),
  ('Webhook Support', 'webhook-support', 'Send and receive webhook events', 'workflow'),
  ('Search', 'search', 'Full-text search across content', 'general'),
  ('AI Function Calling', 'ai-function-calling', 'Execute AI function/tool calls', 'ai'),
  ('Code Execution', 'code-execution', 'Run code snippets or scripts', 'development'),
  ('Version Control', 'version-control', 'Git operations and repository management', 'development'),
  ('Video Generation', 'video-generation', 'Generate videos from text or images', 'ai'),
  ('Voice Synthesis', 'voice-synthesis', 'Convert text to speech', 'ai'),
  ('Speech Recognition', 'speech-recognition', 'Convert speech to text', 'ai'),
  ('E-commerce Read', 'ecommerce-read', 'Read products, orders, and customers', 'commerce'),
  ('E-commerce Write', 'ecommerce-write', 'Create and update e-commerce records', 'commerce'),
  ('Team Messaging', 'team-messaging', 'Send and receive team messages', 'communication'),
  ('Document Processing', 'document-processing', 'Parse, transform, and generate documents', 'general'),
  ('Data Sync', 'data-sync', 'Bidirectional data synchronization', 'workflow'),
  ('Workflow Trigger', 'workflow-trigger', 'Trigger external workflow automations', 'workflow')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Map existing integrations to capabilities
-- ═══════════════════════════════════════════════════════════════

-- AI Providers
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('openai', 'anthropic-claude', 'google-gemini', 'openrouter', 'deepseek', 'qwen', 'grok')
  AND c.slug IN ('chat-completion', 'ai-function-calling')
ON CONFLICT DO NOTHING;

INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug = 'openai'
  AND c.slug IN ('image-generation', 'speech-recognition', 'voice-synthesis')
ON CONFLICT DO NOTHING;

-- Communication
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug = 'slack' AND c.slug IN ('team-messaging', 'send-notification', 'webhook-support')
ON CONFLICT DO NOTHING;

INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug = 'discord' AND c.slug IN ('team-messaging', 'send-notification', 'webhook-support')
ON CONFLICT DO NOTHING;

INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('gmail', 'outlook') AND c.slug IN ('send-email', 'calendar-read', 'calendar-write')
ON CONFLICT DO NOTHING;

-- Storage
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('google-drive', 'dropbox', 'onedrive') AND c.slug IN ('file-upload', 'file-download', 'search')
ON CONFLICT DO NOTHING;

-- Dev tools
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('github', 'gitlab', 'bitbucket') AND c.slug IN ('version-control', 'webhook-support', 'search')
ON CONFLICT DO NOTHING;

-- Payment
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('stripe', 'paystack', 'flutterwave') AND c.slug IN ('payment-processing', 'webhook-support')
ON CONFLICT DO NOTHING;

-- Commerce
INSERT INTO public.integration_capabilities_map (integration_id, capability_id)
SELECT i.id, c.id
FROM public.integrations i, public.integration_capabilities c
WHERE i.slug IN ('shopify', 'woocommerce') AND c.slug IN ('ecommerce-read', 'ecommerce-write', 'webhook-support')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- RLS: Enable Row Level Security on all new tables
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.integration_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_capabilities_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_token_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publisher_verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extension_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_recommendations ENABLE ROW LEVEL SECURITY;

-- Service role (Postgres) has full access
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'integration_capabilities', 'integration_capabilities_map',
    'oauth_token_audit', 'webhook_dead_letters',
    'integration_health_scores', 'integration_usage_metrics',
    'marketplace_publishers', 'publisher_verification_requests',
    'platform_versions', 'extension_dependencies',
    'ai_provider_recommendations'
  ] LOOP
    EXECUTE format('CREATE POLICY "%I_service_role_all" ON public.%I FOR ALL TO postgres USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%I_anon_all" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════

-- Record daily usage metrics (upsert)
CREATE OR REPLACE FUNCTION public.upsert_integration_usage_metric(
  p_workspace_id UUID,
  p_integration_id UUID,
  p_account_id UUID,
  p_date DATE,
  p_api_requests INT DEFAULT 0,
  p_failed_requests INT DEFAULT 0,
  p_total_response_ms BIGINT DEFAULT 0,
  p_credits_consumed DECIMAL DEFAULT 0,
  p_tokens_consumed INT DEFAULT 0,
  p_ai_requests INT DEFAULT 0,
  p_webhook_sent INT DEFAULT 0,
  p_webhook_received INT DEFAULT 0,
  p_sync_count INT DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.integration_usage_metrics (
    workspace_id, integration_id, account_id, date,
    api_requests, failed_requests, total_response_ms,
    credits_consumed, tokens_consumed, ai_requests,
    webhook_sent, webhook_received, sync_count
  ) VALUES (
    p_workspace_id, p_integration_id, p_account_id, p_date,
    p_api_requests, p_failed_requests, p_total_response_ms,
    p_credits_consumed, p_tokens_consumed, p_ai_requests,
    p_webhook_sent, p_webhook_received, p_sync_count
  )
  ON CONFLICT (workspace_id, integration_id, account_id, date)
  DO UPDATE SET
    api_requests = integration_usage_metrics.api_requests + EXCLUDED.api_requests,
    failed_requests = integration_usage_metrics.failed_requests + EXCLUDED.failed_requests,
    total_response_ms = integration_usage_metrics.total_response_ms + EXCLUDED.total_response_ms,
    credits_consumed = integration_usage_metrics.credits_consumed + EXCLUDED.credits_consumed,
    tokens_consumed = integration_usage_metrics.tokens_consumed + EXCLUDED.tokens_consumed,
    ai_requests = integration_usage_metrics.ai_requests + EXCLUDED.ai_requests,
    webhook_sent = integration_usage_metrics.webhook_sent + EXCLUDED.webhook_sent,
    webhook_received = integration_usage_metrics.webhook_received + EXCLUDED.webhook_received,
    sync_count = integration_usage_metrics.sync_count + EXCLUDED.sync_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old usage metrics (retain 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_usage_metrics() RETURNS VOID AS $$
BEGIN
  DELETE FROM public.integration_usage_metrics WHERE date < CURRENT_DATE - INTERVAL '90 days';
  DELETE FROM public.webhook_dead_letters WHERE created_at < NOW() - INTERVAL '30 days' AND status = 'resolved';
  DELETE FROM public.oauth_token_audit WHERE created_at < NOW() - INTERVAL '180 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
