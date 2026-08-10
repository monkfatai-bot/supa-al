-- ═══════════════════════════════════════════════════════════════
-- Phase 10: Integration Hub & Marketplace
-- Full schema for integrations, OAuth, API keys, webhooks,
-- marketplace, extensions, SDK packages, and event bus
-- ═══════════════════════════════════════════════════════════════

-- ─── Enums ────────────────────────────────────────────────────────

CREATE TYPE integration_category AS ENUM (
  'ai', 'communication', 'storage', 'calendar', 'payment',
  'development', 'commerce', 'other'
);

CREATE TYPE integration_status AS ENUM (
  'active', 'inactive', 'maintenance', 'deprecated'
);

CREATE TYPE oauth_provider AS ENUM (
  'google', 'microsoft', 'github', 'gitlab', 'bitbucket',
  'slack', 'discord', 'telegram', 'stripe', 'paystack',
  'flutterwave', 'shopify', 'woocommerce', 'dropbox', 'box',
  'openai', 'anthropic', 'google_gemini', 'grok', 'deepseek',
  'qwen', 'openrouter'
);

CREATE TYPE api_key_status AS ENUM (
  'active', 'inactive', 'expired', 'revoked'
);

CREATE TYPE webhook_status AS ENUM (
  'active', 'inactive', 'suspended'
);

CREATE TYPE webhook_event_status AS ENUM (
  'pending', 'success', 'failed', 'retrying', 'dead'
);

CREATE TYPE marketplace_item_type AS ENUM (
  'ai_employee', 'workflow_template', 'business_template',
  'prompt_pack', 'node_pack', 'integration_pack', 'extension'
);

CREATE TYPE marketplace_item_status AS ENUM (
  'draft', 'published', 'unlisted', 'archived', 'rejected'
);

CREATE TYPE extension_status AS ENUM (
  'active', 'inactive', 'error', 'updating'
);

CREATE TYPE event_direction AS ENUM (
  'inbound', 'outbound'
);

CREATE TYPE log_status AS ENUM (
  'success', 'error', 'timeout'
);

CREATE TYPE pricing_type AS ENUM (
  'free', 'paid', 'freemium', 'subscription'
);

CREATE TYPE subscription_status AS ENUM (
  'active', 'canceled', 'past_due', 'trialing', 'paused'
);

-- ─── Reusable updated_at trigger ─────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 1. integrations (global registry, NOT workspace-scoped)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon_url TEXT,
  category integration_category NOT NULL,
  provider oauth_provider,
  capabilities JSONB DEFAULT '[]',
  status integration_status DEFAULT 'active',
  version TEXT DEFAULT '1.0.0',
  is_public BOOLEAN DEFAULT true,
  config_schema JSONB DEFAULT '{}',
  auth_type TEXT, -- 'oauth', 'api_key', 'webhook', 'none'
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_slug ON integrations(slug);
CREATE INDEX idx_integrations_category ON integrations(category);
CREATE INDEX idx_integrations_status ON integrations(status);
CREATE INDEX idx_integrations_provider ON integrations(provider);
CREATE INDEX idx_integrations_created_by ON integrations(created_by);

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: global table – all authenticated can read, only service_role can modify
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integrations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON integrations
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. integration_accounts
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE integration_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  display_name TEXT,
  status integration_status DEFAULT 'active',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, integration_id)
);

CREATE INDEX idx_integration_accounts_workspace ON integration_accounts(workspace_id);
CREATE INDEX idx_integration_accounts_integration ON integration_accounts(integration_id);
CREATE INDEX idx_integration_accounts_status ON integration_accounts(status);

CREATE TRIGGER integration_accounts_updated_at
  BEFORE UPDATE ON integration_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE integration_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON integration_accounts
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_accounts.workspace_id));

CREATE POLICY "workspace_insert" ON integration_accounts
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_accounts.workspace_id));

CREATE POLICY "workspace_update" ON integration_accounts
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_accounts.workspace_id));

CREATE POLICY "workspace_delete" ON integration_accounts
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_accounts.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 3. oauth_tokens
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_account_id UUID NOT NULL REFERENCES integration_accounts(id) ON DELETE CASCADE,
  provider oauth_provider NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'bearer',
  scope TEXT DEFAULT '',
  expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oauth_tokens_account ON oauth_tokens(integration_account_id);
CREATE INDEX idx_oauth_tokens_provider ON oauth_tokens(provider);
CREATE INDEX idx_oauth_tokens_expires ON oauth_tokens(expires_at);

CREATE TRIGGER oauth_tokens_updated_at
  BEFORE UPDATE ON oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: EXTRA STRICT – only service_role can access (tokens must never be exposed to client)
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON oauth_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. api_keys
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  permissions JSONB DEFAULT '[]',
  scope TEXT DEFAULT 'workspace',
  rate_limit INTEGER DEFAULT 1000,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status api_key_status DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_created_by ON api_keys(created_by);

CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Workspace members can read, but encrypted_key must be excluded at query level
CREATE POLICY "workspace_select" ON api_keys
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = api_keys.workspace_id));

CREATE POLICY "workspace_insert" ON api_keys
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = api_keys.workspace_id));

CREATE POLICY "workspace_update" ON api_keys
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = api_keys.workspace_id));

CREATE POLICY "workspace_delete" ON api_keys
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = api_keys.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 5. webhooks
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  status webhook_status DEFAULT 'active',
  retry_count INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  headers JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  last_triggered_at TIMESTAMPTZ,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_workspace ON webhooks(workspace_id);
CREATE INDEX idx_webhooks_status ON webhooks(status);
CREATE INDEX idx_webhooks_created_by ON webhooks(created_by);

CREATE TRIGGER webhooks_updated_at
  BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON webhooks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON webhooks
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhooks.workspace_id));

CREATE POLICY "workspace_insert" ON webhooks
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = webhooks.workspace_id));

CREATE POLICY "workspace_update" ON webhooks
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhooks.workspace_id));

CREATE POLICY "workspace_delete" ON webhooks
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhooks.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 6. webhook_events
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempt_count INTEGER DEFAULT 0,
  status webhook_event_status DEFAULT 'pending',
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_events_webhook ON webhook_events(webhook_id);
CREATE INDEX idx_webhook_events_workspace ON webhook_events(workspace_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created ON webhook_events(created_at);

-- No updated_at trigger – logs are immutable

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON webhook_events
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhook_events.workspace_id));

CREATE POLICY "workspace_insert" ON webhook_events
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = webhook_events.workspace_id));

CREATE POLICY "workspace_update" ON webhook_events
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhook_events.workspace_id));

CREATE POLICY "workspace_delete" ON webhook_events
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = webhook_events.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 7. integration_logs
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id),
  account_id UUID REFERENCES integration_accounts(id),
  action TEXT NOT NULL,
  direction event_direction DEFAULT 'outbound',
  request JSONB,
  response JSONB,
  status log_status DEFAULT 'success',
  error_message TEXT,
  duration_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_logs_workspace ON integration_logs(workspace_id);
CREATE INDEX idx_integration_logs_integration ON integration_logs(integration_id);
CREATE INDEX idx_integration_logs_account ON integration_logs(account_id);
CREATE INDEX idx_integration_logs_action ON integration_logs(action);
CREATE INDEX idx_integration_logs_status ON integration_logs(status);
CREATE INDEX idx_integration_logs_created ON integration_logs(created_at);

-- No updated_at trigger – logs are immutable

ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON integration_logs
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_logs.workspace_id));

CREATE POLICY "workspace_insert" ON integration_logs
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_logs.workspace_id));

CREATE POLICY "workspace_update" ON integration_logs
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_logs.workspace_id));

CREATE POLICY "workspace_delete" ON integration_logs
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_logs.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 8. integration_permissions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE integration_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}',
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(workspace_id, integration_id)
);

CREATE INDEX idx_integration_permissions_workspace ON integration_permissions(workspace_id);
CREATE INDEX idx_integration_permissions_integration ON integration_permissions(integration_id);
CREATE INDEX idx_integration_permissions_granted_by ON integration_permissions(granted_by);

ALTER TABLE integration_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_permissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON integration_permissions
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_permissions.workspace_id));

CREATE POLICY "workspace_insert" ON integration_permissions
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_permissions.workspace_id));

CREATE POLICY "workspace_update" ON integration_permissions
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_permissions.workspace_id));

CREATE POLICY "workspace_delete" ON integration_permissions
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = integration_permissions.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 10. marketplace_categories (created before marketplace_items for FK)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  parent_id UUID REFERENCES marketplace_categories(id),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_categories_slug ON marketplace_categories(slug);
CREATE INDEX idx_marketplace_categories_parent ON marketplace_categories(parent_id);
CREATE INDEX idx_marketplace_categories_active ON marketplace_categories(is_active);

-- No updated_at column

ALTER TABLE marketplace_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON marketplace_categories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON marketplace_categories
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 9. marketplace_items
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE marketplace_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  type marketplace_item_type NOT NULL,
  category_id UUID REFERENCES marketplace_categories(id),
  author_id UUID REFERENCES auth.users(id),
  version TEXT DEFAULT '1.0.0',
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  install_count INTEGER DEFAULT 0,
  icon_url TEXT,
  screenshots JSONB DEFAULT '[]',
  features TEXT[] DEFAULT '{}',
  pricing_type pricing_type DEFAULT 'free',
  price NUMERIC(10,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  status marketplace_item_status DEFAULT 'draft',
  is_featured BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_items_slug ON marketplace_items(slug);
CREATE INDEX idx_marketplace_items_type ON marketplace_items(type);
CREATE INDEX idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX idx_marketplace_items_category ON marketplace_items(category_id);
CREATE INDEX idx_marketplace_items_author ON marketplace_items(author_id);
CREATE INDEX idx_marketplace_items_featured ON marketplace_items(is_featured) WHERE is_featured = true;

CREATE TRIGGER marketplace_items_updated_at
  BEFORE UPDATE ON marketplace_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON marketplace_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON marketplace_items
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 11. marketplace_reviews
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  status TEXT DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'flagged')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

CREATE INDEX idx_marketplace_reviews_item ON marketplace_reviews(item_id);
CREATE INDEX idx_marketplace_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX idx_marketplace_reviews_workspace ON marketplace_reviews(workspace_id);

CREATE TRIGGER marketplace_reviews_updated_at
  BEFORE UPDATE ON marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON marketplace_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON marketplace_reviews
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = marketplace_reviews.workspace_id));

CREATE POLICY "workspace_insert" ON marketplace_reviews
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = marketplace_reviews.workspace_id));

CREATE POLICY "workspace_update" ON marketplace_reviews
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = marketplace_reviews.workspace_id));

CREATE POLICY "workspace_delete" ON marketplace_reviews
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = marketplace_reviews.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 12. installed_extensions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE installed_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  status extension_status DEFAULT 'active',
  config JSONB DEFAULT '{}',
  installed_by UUID REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, item_id)
);

CREATE INDEX idx_installed_extensions_workspace ON installed_extensions(workspace_id);
CREATE INDEX idx_installed_extensions_item ON installed_extensions(item_id);
CREATE INDEX idx_installed_extensions_status ON installed_extensions(status);
CREATE INDEX idx_installed_extensions_installed_by ON installed_extensions(installed_by);

CREATE TRIGGER installed_extensions_updated_at
  BEFORE UPDATE ON installed_extensions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE installed_extensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON installed_extensions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON installed_extensions
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = installed_extensions.workspace_id));

CREATE POLICY "workspace_insert" ON installed_extensions
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = installed_extensions.workspace_id));

CREATE POLICY "workspace_update" ON installed_extensions
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = installed_extensions.workspace_id));

CREATE POLICY "workspace_delete" ON installed_extensions
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = installed_extensions.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- 13. extension_versions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE extension_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  changelog TEXT,
  package_url TEXT,
  checksum TEXT,
  size_bytes INTEGER DEFAULT 0,
  status TEXT DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, version)
);

CREATE INDEX idx_extension_versions_item ON extension_versions(item_id);
CREATE INDEX idx_extension_versions_status ON extension_versions(status);

-- No updated_at column

ALTER TABLE extension_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON extension_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON extension_versions
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 14. sdk_packages
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE sdk_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  version TEXT DEFAULT '1.0.0',
  author TEXT,
  manifest JSONB NOT NULL DEFAULT '{}',
  package_url TEXT,
  checksum TEXT,
  downloads INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdk_packages_slug ON sdk_packages(slug);
CREATE INDEX idx_sdk_packages_status ON sdk_packages(status);

CREATE TRIGGER sdk_packages_updated_at
  BEFORE UPDATE ON sdk_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sdk_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON sdk_packages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select" ON sdk_packages
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 15. event_subscriptions
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE event_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  handler_type TEXT NOT NULL, -- 'webhook', 'automation', 'employee', 'internal'
  handler_config JSONB NOT NULL DEFAULT '{}',
  status integration_status DEFAULT 'active',
  retry_count INTEGER DEFAULT 3,
  filters JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_subscriptions_workspace ON event_subscriptions(workspace_id);
CREATE INDEX idx_event_subscriptions_event_type ON event_subscriptions(event_type);
CREATE INDEX idx_event_subscriptions_handler_type ON event_subscriptions(handler_type);
CREATE INDEX idx_event_subscriptions_status ON event_subscriptions(status);

CREATE TRIGGER event_subscriptions_updated_at
  BEFORE UPDATE ON event_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE event_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON event_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "workspace_select" ON event_subscriptions
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = event_subscriptions.workspace_id));

CREATE POLICY "workspace_insert" ON event_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE id = event_subscriptions.workspace_id));

CREATE POLICY "workspace_update" ON event_subscriptions
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = event_subscriptions.workspace_id));

CREATE POLICY "workspace_delete" ON event_subscriptions
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT id FROM workspaces WHERE id = event_subscriptions.workspace_id));

-- ═══════════════════════════════════════════════════════════════
-- Seed Data: Default Marketplace Categories
-- ═══════════════════════════════════════════════════════════════

INSERT INTO marketplace_categories (name, slug, description, icon, sort_order) VALUES
  ('AI Employees', 'ai-employees', 'Pre-built AI employees for various business roles', 'Bot', 1),
  ('Workflow Templates', 'workflow-templates', 'Ready-to-use workflow automation templates', 'GitBranch', 2),
  ('Business Templates', 'business-templates', 'Business document and process templates', 'Briefcase', 3),
  ('Prompt Packs', 'prompt-packs', 'Curated collections of AI prompts', 'MessageSquareText', 4),
  ('Node Packs', 'node-packs', 'Additional workflow node types and connectors', 'Workflow', 5),
  ('Integration Packs', 'integration-packs', 'Pre-configured integration bundles', 'Puzzle', 6),
  ('Extensions', 'extensions', 'Platform extensions and plugins', 'Extension', 7)
ON CONFLICT (slug) DO NOTHING;
