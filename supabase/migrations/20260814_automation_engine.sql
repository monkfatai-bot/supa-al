-- ──────────────────────────────────────────────────────────────────────────────────────
-- Phase 9A — Automation Engine
-- Migration: 009_automation_engine.sql
-- Tables: workflows, workflow_versions, workflow_triggers, workflow_actions,
--         workflow_runs, workflow_logs, workflow_variables, scheduled_jobs,
--         automation_templates
-- ──────────────────────────────────────────────────────────────────────────────────────

-- ── Enums ──────────────────────────────────────────────────────────────────────────

CREATE TYPE workflow_status AS ENUM (
  'draft',
  'active',
  'paused',
  'archived'
);

CREATE TYPE workflow_run_status AS ENUM (
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'retrying'
);

CREATE TYPE trigger_type AS ENUM (
  'event',
  'schedule',
  'manual',
  'webhook',
  'api'
);

CREATE TYPE action_type AS ENUM (
  'ai_chat',
  'generate_image',
  'generate_video',
  'generate_voice',
  'send_notification',
  'create_task',
  'update_crm',
  'create_invoice',
  'update_database',
  'http_request',
  'webhook',
  'delay',
  'condition',
  'loop',
  'custom'
);

CREATE TYPE execution_mode AS ENUM (
  'sequential',
  'parallel',
  'conditional'
);

CREATE TYPE schedule_type AS ENUM (
  'once',
  'daily',
  'weekly',
  'monthly',
  'cron'
);

CREATE TYPE scheduled_job_status AS ENUM (
  'active',
  'paused',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE log_level AS ENUM (
  'debug',
  'info',
  'warn',
  'error'
);

CREATE TYPE variable_scope AS ENUM (
  'global',
  'local',
  'user',
  'workspace',
  'environment',
  'step_output',
  'ai_output'
);

CREATE TYPE condition_operator AS ENUM (
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'greater_than_or_equal',
  'less_than_or_equal',
  'is_empty',
  'is_not_empty',
  'exists',
  'not_exists',
  'starts_with',
  'ends_with',
  'is_boolean',
  'is_true',
  'is_false'
);

CREATE TYPE template_category AS ENUM (
  'onboarding',
  'crm',
  'billing',
  'project_management',
  'communication',
  'data_processing',
  'ai_automation',
  'custom'
);

-- ── Workflows ──────────────────────────────────────────────────────────────────────

CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        workflow_status NOT NULL DEFAULT 'draft',
  execution_mode execution_mode NOT NULL DEFAULT 'sequential',
  version       INTEGER NOT NULL DEFAULT 1,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_by    UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_workspace_id ON workflows(workspace_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_created_by ON workflows(created_by);

-- ── Workflow Versions ──────────────────────────────────────────────────────────────

CREATE TABLE workflow_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  definition      JSONB NOT NULL DEFAULT '{}',
  change_summary  TEXT NOT NULL DEFAULT '',
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_workflow_versions_workflow_version ON workflow_versions(workflow_id, version_number);
CREATE INDEX idx_workflow_versions_workflow_id ON workflow_versions(workflow_id);

-- ── Workflow Triggers ──────────────────────────────────────────────────────────────

CREATE TABLE workflow_triggers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trigger_type  trigger_type NOT NULL,
  event_name    TEXT NOT NULL DEFAULT '',
  config        JSONB NOT NULL DEFAULT '{}',
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX idx_workflow_triggers_type ON workflow_triggers(trigger_type);
CREATE INDEX idx_workflow_triggers_enabled ON workflow_triggers(is_enabled) WHERE is_enabled = true;

-- ── Workflow Actions ───────────────────────────────────────────────────────────────

CREATE TABLE workflow_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  action_type   action_type NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}',
  step_position INTEGER NOT NULL DEFAULT 0,
  retry_limit   INTEGER NOT NULL DEFAULT 0,
  timeout_ms    INTEGER NOT NULL DEFAULT 30000,
  on_failure    TEXT NOT NULL DEFAULT 'stop', -- 'stop' | 'continue' | 'retry'
  next_action_id UUID REFERENCES workflow_actions(id) ON DELETE SET NULL,
  parent_action_id UUID REFERENCES workflow_actions(id) ON DELETE SET NULL,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_actions_workflow_id ON workflow_actions(workflow_id);
CREATE INDEX idx_workflow_actions_type ON workflow_actions(action_type);
CREATE INDEX idx_workflow_actions_position ON workflow_actions(workflow_id, step_position);

-- ── Workflow Runs ──────────────────────────────────────────────────────────────────

CREATE TABLE workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE SET NULL,
  status          workflow_run_status NOT NULL DEFAULT 'pending',
  trigger_type    trigger_type NOT NULL,
  trigger_id      UUID REFERENCES workflow_triggers(id) ON DELETE SET NULL,
  current_step_id UUID REFERENCES workflow_actions(id) ON DELETE SET NULL,
  previous_step_id UUID REFERENCES workflow_actions(id) ON DELETE SET NULL,
  input_data      JSONB NOT NULL DEFAULT '{}',
  output_data     JSONB NOT NULL DEFAULT '{}',
  error_message   TEXT NOT NULL DEFAULT '',
  error_details   JSONB NOT NULL DEFAULT '{}',
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  duration_ms     INTEGER,
  workspace_id    UUID NOT NULL,
  user_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_workspace_id ON workflow_runs(workspace_id);
CREATE INDEX idx_workflow_runs_user_id ON workflow_runs(user_id);
CREATE INDEX idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
CREATE INDEX idx_workflow_runs_retrying ON workflow_runs(status) WHERE status = 'retrying';

-- ── Workflow Logs ──────────────────────────────────────────────────────────────────

CREATE TABLE workflow_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  action_id       UUID REFERENCES workflow_actions(id) ON DELETE SET NULL,
  level           log_level NOT NULL DEFAULT 'info',
  message         TEXT NOT NULL DEFAULT '',
  details         JSONB NOT NULL DEFAULT '{}',
  duration_ms     INTEGER,
  step_position   INTEGER,
  workspace_id    UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_logs_run_id ON workflow_logs(run_id);
CREATE INDEX idx_workflow_logs_workflow_id ON workflow_logs(workflow_id);
CREATE INDEX idx_workflow_logs_level ON workflow_logs(level);
CREATE INDEX idx_workflow_logs_created_at ON workflow_logs(created_at DESC);

-- ── Workflow Variables ─────────────────────────────────────────────────────────────

CREATE TABLE workflow_variables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  run_id        UUID REFERENCES workflow_runs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  value         JSONB NOT NULL DEFAULT '{}',
  scope         variable_scope NOT NULL DEFAULT 'local',
  is_encrypted  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_variables_workflow_id ON workflow_variables(workflow_id);
CREATE INDEX idx_workflow_variables_run_id ON workflow_variables(run_id);
CREATE UNIQUE INDEX idx_workflow_variables_workflow_name ON workflow_variables(workflow_id, name) WHERE run_id IS NULL;

-- ── Scheduled Jobs ────────────────────────────────────────────────────────────────

CREATE TABLE scheduled_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  schedule_type   schedule_type NOT NULL,
  cron_expression TEXT NOT NULL DEFAULT '',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER NOT NULL DEFAULT 0,
  max_runs        INTEGER, -- NULL = unlimited
  status          scheduled_job_status NOT NULL DEFAULT 'active',
  config          JSONB NOT NULL DEFAULT '{}',
  created_by      UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_jobs_workflow_id ON scheduled_jobs(workflow_id);
CREATE INDEX idx_scheduled_jobs_workspace_id ON scheduled_jobs(workspace_id);
CREATE INDEX idx_scheduled_jobs_status ON scheduled_jobs(status);
CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE status = 'active';

-- ── Automation Templates ───────────────────────────────────────────────────────────

CREATE TABLE automation_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category      template_category NOT NULL DEFAULT 'custom',
  icon          TEXT NOT NULL DEFAULT '',
  definition    JSONB NOT NULL DEFAULT '{}',
  triggers      JSONB NOT NULL DEFAULT '[]',
  actions       JSONB NOT NULL DEFAULT '[]',
  variables     JSONB NOT NULL DEFAULT '[]',
  is_system     BOOLEAN NOT NULL DEFAULT false,
  usage_count   INTEGER NOT NULL DEFAULT 0,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_templates_category ON automation_templates(category);
CREATE INDEX idx_automation_templates_system ON automation_templates(is_system) WHERE is_system = true;

-- ── RLS Policies ──────────────────────────────────────────────────────────────────

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;

-- Workflows: workspace members can read, owners/admins can write
CREATE POLICY workflows_select ON workflows
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY workflows_insert ON workflows
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY workflows_update ON workflows
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY workflows_delete ON workflows
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Workflow versions: same as workflows (read for members, write for admins)
CREATE POLICY workflow_versions_select ON workflow_versions
  FOR SELECT USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

CREATE POLICY workflow_versions_insert ON workflow_versions
  FOR INSERT WITH CHECK (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

-- Workflow triggers: same pattern
CREATE POLICY workflow_triggers_select ON workflow_triggers
  FOR SELECT USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

CREATE POLICY workflow_triggers_insert ON workflow_triggers
  FOR INSERT WITH CHECK (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

CREATE POLICY workflow_triggers_update ON workflow_triggers
  FOR UPDATE USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

CREATE POLICY workflow_triggers_delete ON workflow_triggers
  FOR DELETE USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

-- Workflow actions: same pattern
CREATE POLICY workflow_actions_select ON workflow_actions
  FOR SELECT USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

CREATE POLICY workflow_actions_insert ON workflow_actions
  FOR INSERT WITH CHECK (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

CREATE POLICY workflow_actions_update ON workflow_actions
  FOR UPDATE USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

CREATE POLICY workflow_actions_delete ON workflow_actions
  FOR DELETE USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

-- Workflow runs: workspace members can read
CREATE POLICY workflow_runs_select ON workflow_runs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY workflow_runs_insert ON workflow_runs
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY workflow_runs_update ON workflow_runs
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

-- Workflow logs: workspace members can read
CREATE POLICY workflow_logs_select ON workflow_logs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY workflow_logs_insert ON workflow_logs
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Workflow variables: workspace members can read, admins can write
CREATE POLICY workflow_variables_select ON workflow_variables
  FOR SELECT USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  );

CREATE POLICY workflow_variables_insert ON workflow_variables
  FOR INSERT WITH CHECK (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

CREATE POLICY workflow_variables_update ON workflow_variables
  FOR UPDATE USING (
    workflow_id IN (SELECT id FROM workflows WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  );

-- Scheduled jobs: workspace members can read, admins can write
CREATE POLICY scheduled_jobs_select ON scheduled_jobs
  FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

CREATE POLICY scheduled_jobs_insert ON scheduled_jobs
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY scheduled_jobs_update ON scheduled_jobs
  FOR UPDATE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
  );

CREATE POLICY scheduled_jobs_delete ON scheduled_jobs
  FOR DELETE USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Automation templates: authenticated users can read, system templates are read-only
CREATE POLICY automation_templates_select ON automation_templates
  FOR SELECT USING (true); -- All authenticated users can browse templates

CREATE POLICY automation_templates_insert ON automation_templates
  FOR INSERT WITH CHECK (NOT is_system); -- Users cannot create system templates

CREATE POLICY automation_templates_update ON automation_templates
  FOR UPDATE USING (NOT is_system); -- System templates cannot be modified

CREATE POLICY automation_templates_delete ON automation_templates
  FOR DELETE USING (NOT is_system);

-- ── Updated At Triggers ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workflow_triggers_updated_at
  BEFORE UPDATE ON workflow_triggers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workflow_actions_updated_at
  BEFORE UPDATE ON workflow_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workflow_runs_updated_at
  BEFORE UPDATE ON workflow_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workflow_variables_updated_at
  BEFORE UPDATE ON workflow_variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER scheduled_jobs_updated_at
  BEFORE UPDATE ON scheduled_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER automation_templates_updated_at
  BEFORE UPDATE ON automation_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
