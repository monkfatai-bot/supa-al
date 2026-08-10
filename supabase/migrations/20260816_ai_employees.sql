-- ═══════════════════════════════════════════════════════════════
-- Phase 9C: AI Employees Platform
-- Full schema for AI employees, skills, memory, training, and marketplace
-- ═══════════════════════════════════════════════════════════════

-- ─── Enums ────────────────────────────────────────────────────────

CREATE TYPE employee_status AS ENUM (
  'active', 'inactive', 'archived'
);

CREATE TYPE employee_experience_level AS ENUM (
  'junior', 'mid', 'senior', 'expert'
);

CREATE TYPE employee_availability_status AS ENUM (
  'available', 'busy', 'offline'
);

CREATE TYPE employee_memory_scope AS ENUM (
  'long_term', 'session', 'workspace', 'task'
);

CREATE TYPE employee_training_type AS ENUM (
  'document', 'website', 'conversation', 'knowledge_base'
);

CREATE TYPE employee_training_status AS ENUM (
  'pending', 'processing', 'completed', 'failed'
);

CREATE TYPE employee_assignment_type AS ENUM (
  'project', 'task', 'workflow', 'conversation'
);

CREATE TYPE employee_assignment_status AS ENUM (
  'active', 'completed', 'revoked'
);

-- ─── AI Employees ─────────────────────────────────────────────────

CREATE TABLE ai_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT DEFAULT '',
  role VARCHAR(255) NOT NULL DEFAULT '',
  department VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  skills TEXT[] DEFAULT ARRAY[]::TEXT[],
  responsibilities TEXT[] DEFAULT ARRAY[]::TEXT[],
  supported_tools TEXT[] DEFAULT ARRAY[]::TEXT[],
  permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
  status employee_status NOT NULL DEFAULT 'active',
  experience_level employee_experience_level NOT NULL DEFAULT 'mid',
  availability_status employee_availability_status NOT NULL DEFAULT 'available',
  performance_rating NUMERIC(3,2) DEFAULT 0 CHECK (performance_rating >= 0 AND performance_rating <= 5),
  total_tasks_completed INT NOT NULL DEFAULT 0,
  total_ai_credits_used INT NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_employees_workspace ON ai_employees(workspace_id);
CREATE INDEX idx_ai_employees_status ON ai_employees(status);
CREATE INDEX idx_ai_employees_department ON ai_employees(department);

-- ─── Employee Skills ─────────────────────────────────────────────

CREATE TABLE employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  skill_name VARCHAR(255) NOT NULL,
  skill_category VARCHAR(100) NOT NULL DEFAULT 'general',
  proficiency_level INT NOT NULL DEFAULT 50 CHECK (proficiency_level >= 0 AND proficiency_level <= 100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_skills_employee ON employee_skills(employee_id);

-- ─── Employee Memory ──────────────────────────────────────────────

CREATE TABLE employee_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  scope employee_memory_scope NOT NULL DEFAULT 'long_term',
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_memory_employee ON employee_memory(employee_id);
CREATE INDEX idx_employee_memory_scope ON employee_memory(scope);

-- ─── Employee Training ───────────────────────────────────────────

CREATE TABLE employee_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  training_type employee_training_type NOT NULL,
  source_name VARCHAR(255) NOT NULL DEFAULT '',
  source_url TEXT DEFAULT '',
  content_hash VARCHAR(64) DEFAULT '',
  status employee_training_status NOT NULL DEFAULT 'pending',
  items_count INT NOT NULL DEFAULT 0,
  processed_items INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_employee_training_employee ON employee_training(employee_id);

-- ─── Employee Departments ─────────────────────────────────────────

CREATE TABLE employee_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Employee Assignments ────────────────────────────────────────

CREATE TABLE employee_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id UUID,
  task_id UUID,
  assignment_type employee_assignment_type NOT NULL DEFAULT 'task',
  status employee_assignment_status NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_assignments_employee ON employee_assignments(employee_id);
CREATE INDEX idx_employee_assignments_workspace ON employee_assignments(workspace_id);

-- ─── Employee Performance ────────────────────────────────────────

CREATE TABLE employee_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end TIMESTAMPTZ NOT NULL DEFAULT now(),
  tasks_completed INT NOT NULL DEFAULT 0,
  tasks_failed INT NOT NULL DEFAULT 0,
  avg_response_time_ms INT NOT NULL DEFAULT 0,
  ai_credits_used INT NOT NULL DEFAULT 0,
  user_rating NUMERIC(3,2) DEFAULT 0 CHECK (user_rating >= 0 AND user_rating <= 5),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_performance_employee ON employee_performance(employee_id);
CREATE INDEX idx_employee_performance_workspace ON employee_performance(workspace_id);
CREATE INDEX idx_employee_performance_period ON employee_performance(employee_id, period_start, period_end);

-- ─── Employee Messages ───────────────────────────────────────────

CREATE TABLE employee_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_messages_conversation ON employee_messages(conversation_id);
CREATE INDEX idx_employee_messages_sender ON employee_messages(sender_id);
CREATE INDEX idx_employee_messages_recipient ON employee_messages(recipient_id);
CREATE INDEX idx_employee_messages_workspace ON employee_messages(workspace_id);

-- ─── Employee Marketplace ─────────────────────────────────────────

CREATE TABLE employee_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  description TEXT DEFAULT '',
  rating NUMERIC(3,2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  review_count INT NOT NULL DEFAULT 0,
  install_count INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  version TEXT NOT NULL DEFAULT '1.0.0',
  metadata JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employee_marketplace_employee ON employee_marketplace(employee_id);
CREATE INDEX idx_employee_marketplace_category ON employee_marketplace(category);
CREATE INDEX idx_employee_marketplace_featured ON employee_marketplace(is_featured) WHERE is_featured = TRUE;

-- ─── Employee Versions ────────────────────────────────────────────

CREATE TABLE employee_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES ai_employees(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  snapshot JSONB NOT NULL DEFAULT '{}',
  change_summary TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, version_number)
);

-- ═══════════════════════════════════════════════════════════════
-- RLS Policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE ai_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_marketplace ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_versions ENABLE ROW LEVEL SECURITY;

-- ai_employees: workspace members can read, owners/admins can write
CREATE POLICY "Workspace members can view ai_employees"
  ON ai_employees FOR SELECT
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
    OR is_public = TRUE
  );

CREATE POLICY "Workspace admins can insert ai_employees"
  ON ai_employees FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update ai_employees"
  ON ai_employees FOR UPDATE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete ai_employees"
  ON ai_employees FOR DELETE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_skills: follows parent employee
CREATE POLICY "Workspace members can view employee_skills"
  ON employee_skills FOR SELECT
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid())
    OR employee_id IN (SELECT e.id FROM ai_employees e WHERE e.is_public = TRUE)
  );

CREATE POLICY "Workspace admins can insert employee_skills"
  ON employee_skills FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_skills"
  ON employee_skills FOR UPDATE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_skills"
  ON employee_skills FOR DELETE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_memory: follows parent employee
CREATE POLICY "Workspace members can view employee_memory"
  ON employee_memory FOR SELECT
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid())
    OR workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert employee_memory"
  ON employee_memory FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_memory"
  ON employee_memory FOR UPDATE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_memory"
  ON employee_memory FOR DELETE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_training: follows parent employee
CREATE POLICY "Workspace members can view employee_training"
  ON employee_training FOR SELECT
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert employee_training"
  ON employee_training FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_training"
  ON employee_training FOR UPDATE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_training"
  ON employee_training FOR DELETE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_departments: workspace members can read, admins can write
CREATE POLICY "Workspace members can view employee_departments"
  ON employee_departments FOR SELECT
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert employee_departments"
  ON employee_departments FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_departments"
  ON employee_departments FOR UPDATE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_departments"
  ON employee_departments FOR DELETE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_assignments: workspace members can read, admins can write
CREATE POLICY "Workspace members can view employee_assignments"
  ON employee_assignments FOR SELECT
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can insert employee_assignments"
  ON employee_assignments FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can update employee_assignments"
  ON employee_assignments FOR UPDATE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can delete employee_assignments"
  ON employee_assignments FOR DELETE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_performance: workspace members can read, admins can write
CREATE POLICY "Workspace members can view employee_performance"
  ON employee_performance FOR SELECT
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert employee_performance"
  ON employee_performance FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_performance"
  ON employee_performance FOR UPDATE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_performance"
  ON employee_performance FOR DELETE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_messages: workspace members can read/write
CREATE POLICY "Workspace members can view employee_messages"
  ON employee_messages FOR SELECT
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can insert employee_messages"
  ON employee_messages FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can update employee_messages"
  ON employee_messages FOR UPDATE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can delete employee_messages"
  ON employee_messages FOR DELETE
  USING (
    workspace_id IN (SELECT w.id FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_marketplace: public read, admins write
CREATE POLICY "Anyone can view employee_marketplace"
  ON employee_marketplace FOR SELECT
  USING (true);

CREATE POLICY "Workspace admins can insert employee_marketplace"
  ON employee_marketplace FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_marketplace"
  ON employee_marketplace FOR UPDATE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_marketplace"
  ON employee_marketplace FOR DELETE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- employee_versions: follows parent employee
CREATE POLICY "Workspace members can view employee_versions"
  ON employee_versions FOR SELECT
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert employee_versions"
  ON employee_versions FOR INSERT
  WITH CHECK (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update employee_versions"
  ON employee_versions FOR UPDATE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete employee_versions"
  ON employee_versions FOR DELETE
  USING (
    employee_id IN (SELECT e.id FROM ai_employees e
      JOIN workspace_members wm ON wm.workspace_id = e.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- ─── Updated At Triggers ──────────────────────────────────────────

CREATE TRIGGER update_ai_employees_updated_at
  BEFORE UPDATE ON ai_employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_skills_updated_at
  BEFORE UPDATE ON employee_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_memory_updated_at
  BEFORE UPDATE ON employee_memory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_departments_updated_at
  BEFORE UPDATE ON employee_departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_marketplace_updated_at
  BEFORE UPDATE ON employee_marketplace
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
