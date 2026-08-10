-- ═══════════════════════════════════════════════════════════════
-- Phase 9B: Visual Workflow Builder
-- Adds visual canvas, collaboration, and template categories
-- ═══════════════════════════════════════════════════════════════

-- ─── Enums ────────────────────────────────────────────────────────

CREATE TYPE node_category AS ENUM (
  'trigger', 'ai', 'logic', 'data', 'communication', 'business', 'integration'
);

CREATE TYPE collaboration_role AS ENUM (
  'editor', 'viewer', 'commenter'
);

CREATE TYPE layout_preset AS ENUM (
  'custom', 'flow_left', 'flow_right', 'flow_down', 'radial', 'grid'
);

CREATE TYPE breakpoint_status AS ENUM (
  'active', 'disabled', 'triggered'
);

-- ─── Workflow Nodes (visual canvas nodes) ─────────────────────────

CREATE TABLE workflow_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE SET NULL,
  node_key VARCHAR(255) NOT NULL,            -- unique key within the workflow canvas
  node_type VARCHAR(100) NOT NULL,            -- e.g. 'manual_trigger', 'ai_chat', 'if', 'crm'
  node_category node_category NOT NULL,
  label VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  position_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  position_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION DEFAULT 240,
  height DOUBLE PRECISION DEFAULT 80,
  config JSONB NOT NULL DEFAULT '{}',         -- node-specific configuration
  data JSONB NOT NULL DEFAULT '{}',           -- runtime data, outputs, state
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  retry_limit INT NOT NULL DEFAULT 0,
  timeout_ms INT NOT NULL DEFAULT 30000,
  on_failure VARCHAR(20) NOT NULL DEFAULT 'stop',  -- 'stop' | 'continue' | 'retry'
  step_position INT DEFAULT 0,
  has_breakpoint BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_nodes_workflow ON workflow_nodes(workflow_id);
CREATE INDEX idx_workflow_nodes_version ON workflow_nodes(workflow_version_id);
CREATE INDEX idx_workflow_nodes_type ON workflow_nodes(node_type);
CREATE INDEX idx_workflow_nodes_key ON workflow_nodes(workflow_id, node_key);

-- ─── Workflow Edges (connections between nodes) ───────────────────

CREATE TABLE workflow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE SET NULL,
  edge_key VARCHAR(255) NOT NULL,            -- unique key within the workflow
  source_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  source_handle VARCHAR(100) DEFAULT 'output',
  target_node_id UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_handle VARCHAR(100) DEFAULT 'input',
  label VARCHAR(100) DEFAULT '',
  edge_type VARCHAR(50) DEFAULT 'default',    -- 'default' | 'conditional_true' | 'conditional_false' | 'error'
  is_valid BOOLEAN DEFAULT TRUE,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, edge_key)
);

CREATE INDEX idx_workflow_edges_workflow ON workflow_edges(workflow_id);
CREATE INDEX idx_workflow_edges_source ON workflow_edges(source_node_id);
CREATE INDEX idx_workflow_edges_target ON workflow_edges(target_node_id);

-- ─── Workflow Layouts (canvas state persistence) ──────────────────

CREATE TABLE workflow_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  viewport_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  viewport_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  zoom_level DOUBLE PRECISION NOT NULL DEFAULT 1,
  layout_preset layout_preset DEFAULT 'custom',
  collapsed_panels JSONB NOT NULL DEFAULT '[]',  -- which panels are collapsed
  selected_node_ids UUID[] DEFAULT ARRAY[]::UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, user_id)
);

CREATE INDEX idx_workflow_layouts_user ON workflow_layouts(user_id);

-- ─── Workflow Comments (collaboration comments on canvas) ────────

CREATE TABLE workflow_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_id UUID REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  parent_id UUID REFERENCES workflow_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  mentioned_user_ids UUID[] DEFAULT ARRAY[]::UUID[],
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  position_x DOUBLE PRECISION DEFAULT 0,       -- position on canvas (for pinned comments)
  position_y DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_comments_workflow ON workflow_comments(workflow_id);
CREATE INDEX idx_workflow_comments_node ON workflow_comments(node_id);
CREATE INDEX idx_workflow_comments_user ON workflow_comments(user_id);
CREATE INDEX idx_workflow_comments_parent ON workflow_comments(parent_id);

-- ─── Workflow Collaboration (editing state) ───────────────────────

CREATE TABLE workflow_collaboration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role collaboration_role NOT NULL DEFAULT 'editor',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  last_cursor_position JSONB DEFAULT NULL,     -- {x, y} on canvas
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, user_id)
);

CREATE INDEX idx_workflow_collab_workflow ON workflow_collaboration(workflow_id);
CREATE INDEX idx_workflow_collab_active ON workflow_collaboration(is_active) WHERE is_active = TRUE;

-- ─── Template Categories (expanded from basic automation templates) ─

CREATE TABLE workflow_template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  icon VARCHAR(50) DEFAULT 'folder',
  color VARCHAR(20) DEFAULT 'zinc',
  sort_order INT NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  template_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed categories
INSERT INTO workflow_template_categories (name, slug, description, icon, color, sort_order, is_featured) VALUES
  ('Sales', 'sales', 'Sales pipelines, lead management, and deal automation', 'trending-up', 'emerald', 1, true),
  ('Marketing', 'marketing', 'Email campaigns, content distribution, and audience engagement', 'megaphone', 'violet', 2, true),
  ('Human Resources', 'hr', 'Employee onboarding, leave management, and HR workflows', 'users', 'sky', 3, true),
  ('Finance', 'finance', 'Invoice processing, expense tracking, and financial reporting', 'dollar-sign', 'amber', 4, true),
  ('Customer Support', 'support', 'Ticket routing, response automation, and escalation', 'headphones', 'rose', 5, true),
  ('Ecommerce', 'ecommerce', 'Order processing, inventory sync, and customer journeys', 'shopping-cart', 'orange', 6, true),
  ('Education', 'education', 'Course enrollment, grading automation, and student communication', 'graduation-cap', 'cyan', 7, false),
  ('AI Content', 'ai-content', 'AI-powered content generation, summarization, and classification', 'sparkles', 'purple', 8, true),
  ('AI Research', 'ai-research', 'Research automation, data collection, and analysis pipelines', 'microscope', 'indigo', 9, false),
  ('Business Operations', 'operations', 'Internal processes, task management, and operational efficiency', 'building', 'slate', 10, true);

-- ─── RLS Policies ─────────────────────────────────────────────────

ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_collaboration ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_template_categories ENABLE ROW LEVEL SECURITY;

-- workflow_nodes: workspace members can read/write
CREATE POLICY "Workspace members can view workflow nodes"
  ON workflow_nodes FOR SELECT
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can insert workflow nodes"
  ON workflow_nodes FOR INSERT
  WITH CHECK (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace members can update workflow nodes"
  ON workflow_nodes FOR UPDATE
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace members can delete workflow nodes"
  ON workflow_nodes FOR DELETE
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- workflow_edges: same pattern
CREATE POLICY "Workspace members can view workflow edges"
  ON workflow_edges FOR SELECT
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace admins can insert workflow edges"
  ON workflow_edges FOR INSERT
  WITH CHECK (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can update workflow edges"
  ON workflow_edges FOR UPDATE
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

CREATE POLICY "Workspace admins can delete workflow edges"
  ON workflow_edges FOR DELETE
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- workflow_layouts: user-specific
CREATE POLICY "Users can view own layouts"
  ON workflow_layouts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own layouts"
  ON workflow_layouts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own layouts"
  ON workflow_layouts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own layouts"
  ON workflow_layouts FOR DELETE
  USING (user_id = auth.uid());

-- workflow_comments: workspace members can read/write
CREATE POLICY "Workspace members can view workflow comments"
  ON workflow_comments FOR SELECT
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Workspace members can insert comments"
  ON workflow_comments FOR INSERT
  WITH CHECK (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Comment authors can update own comments"
  ON workflow_comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Comment authors or admins can delete comments"
  ON workflow_comments FOR DELETE
  USING (
    user_id = auth.uid()
    OR workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin'))
  );

-- workflow_collaboration: workspace members can view, self-manage
CREATE POLICY "Workspace members can view collaboration"
  ON workflow_collaboration FOR SELECT
  USING (
    workflow_id IN (SELECT w.id FROM workflows w
      JOIN workspace_members wm ON wm.workspace_id = w.workspace_id
      WHERE wm.user_id = auth.uid())
  );

CREATE POLICY "Users can insert own collaboration"
  ON workflow_collaboration FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own collaboration"
  ON workflow_collaboration FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own collaboration"
  ON workflow_collaboration FOR DELETE
  USING (user_id = auth.uid());

-- workflow_template_categories: public read
CREATE POLICY "Anyone can view template categories"
  ON workflow_template_categories FOR SELECT
  USING (true);

-- ─── Updated At Triggers ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workflow_nodes_updated_at
  BEFORE UPDATE ON workflow_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_edges_updated_at
  BEFORE UPDATE ON workflow_edges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_layouts_updated_at
  BEFORE UPDATE ON workflow_layouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_comments_updated_at
  BEFORE UPDATE ON workflow_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
