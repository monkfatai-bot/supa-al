-- ═══════════════════════════════════════════════════════════════
-- Sync Engine: tables for integration data synchronisation
-- ═══════════════════════════════════════════════════════════════

-- ─── Enums ────────────────────────────────────────────────────────

CREATE TYPE sync_job_status AS ENUM (
  'pending', 'running', 'completed', 'failed', 'cancelled'
);

CREATE TYPE sync_type AS ENUM (
  'full', 'incremental'
);

CREATE TYPE sync_direction AS ENUM (
  'inbound', 'outbound', 'bidirectional'
);

CREATE TYPE sync_history_action AS ENUM (
  'created', 'updated', 'deleted', 'skipped'
);

CREATE TYPE conflict_resolution AS ENUM (
  'auto_merged', 'manual', 'conflict_pending', 'source_wins', 'target_wins'
);

-- ─── integration_sync_jobs ─────────────────────────────────────────

CREATE TABLE integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES integrations(id),
  sync_type sync_type NOT NULL DEFAULT 'full',
  direction sync_direction NOT NULL DEFAULT 'inbound',
  status sync_job_status NOT NULL DEFAULT 'pending',
  source_entity TEXT NOT NULL,
  target_entity TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  last_sync_cursor TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_jobs_workspace ON integration_sync_jobs(workspace_id);
CREATE INDEX idx_sync_jobs_integration ON integration_sync_jobs(integration_id);
CREATE INDEX idx_sync_jobs_status ON integration_sync_jobs(status);
CREATE INDEX idx_sync_jobs_next_run ON integration_sync_jobs(next_run_at)
  WHERE status = 'pending';

ALTER TABLE integration_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_sync_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── integration_sync_conflicts ────────────────────────────────────

CREATE TABLE integration_sync_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID NOT NULL REFERENCES integration_sync_jobs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  source_value JSONB,
  target_value JSONB,
  resolution conflict_resolution NOT NULL DEFAULT 'conflict_pending',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_conflicts_job ON integration_sync_conflicts(sync_job_id);
CREATE INDEX idx_sync_conflicts_resolution ON integration_sync_conflicts(resolution);
CREATE INDEX idx_sync_conflicts_entity ON integration_sync_conflicts(entity_type, entity_id);

ALTER TABLE integration_sync_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_sync_conflicts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── integration_sync_history ──────────────────────────────────────

CREATE TABLE integration_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_job_id UUID NOT NULL REFERENCES integration_sync_jobs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action sync_history_action NOT NULL,
  source_system TEXT NOT NULL,
  target_system TEXT NOT NULL,
  duration_ms INTEGER,
  record_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_history_job ON integration_sync_history(sync_job_id);
CREATE INDEX idx_sync_history_entity ON integration_sync_history(entity_type, entity_id);
CREATE INDEX idx_sync_history_action ON integration_sync_history(action);
CREATE INDEX idx_sync_history_created ON integration_sync_history(created_at);

ALTER TABLE integration_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_sync_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── integration_sync_schedules ────────────────────────────────────

CREATE TABLE integration_sync_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id),
  sync_type sync_type NOT NULL DEFAULT 'incremental',
  cron_expression TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_schedules_workspace ON integration_sync_schedules(workspace_id);
CREATE INDEX idx_sync_schedules_integration ON integration_sync_schedules(integration_id);
CREATE INDEX idx_sync_schedules_enabled ON integration_sync_schedules(enabled)
  WHERE enabled = true;

ALTER TABLE integration_sync_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON integration_sync_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── updated_at triggers ───────────────────────────────────────────

CREATE TRIGGER set_updated_at BEFORE UPDATE ON integration_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON integration_sync_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
