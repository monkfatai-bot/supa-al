-- ═══════════════════════════════════════════════════════════════
-- Phase 9B Addendum: Atomic Canvas Save via RPC
-- Replaces the non-atomic 5-step saveWorkflowCanvas with a single
-- SECURITY DEFINER function that runs everything in one transaction.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION save_workflow_canvas_atomic(
  p_workspace_id UUID,
  p_workflow_id UUID,
  p_user_id UUID,
  p_nodes JSONB,
  p_edges JSONB,
  p_layout JSONB,
  p_removed_node_ids UUID[],
  p_removed_edge_ids UUID[]
) RETURNS JSONB AS $$
DECLARE
  v_node_rec JSONB;
  v_edge_rec JSONB;
  v_layout_viewport_x DOUBLE PRECISION;
  v_layout_viewport_y DOUBLE PRECISION;
  v_layout_zoom DOUBLE PRECISION;
  v_layout_collapsed JSONB;
  v_layout_id UUID;
  v_node_count INT := 0;
  v_edge_count INT := 0;
BEGIN
  -- ── 1. Delete removed nodes ─────────────────────────────────
  IF p_removed_node_ids IS NOT NULL AND array_length(p_removed_node_ids, 1) > 0 THEN
    DELETE FROM workflow_edges
    WHERE source_node_id = ANY(p_removed_node_ids)
         OR target_node_id = ANY(p_removed_node_ids);

    DELETE FROM workflow_nodes
    WHERE id = ANY(p_removed_node_ids)
      AND workflow_id = p_workflow_id;
  END IF;

  -- ── 2. Delete removed edges ─────────────────────────────────
  IF p_removed_edge_ids IS NOT NULL AND array_length(p_removed_edge_ids, 1) > 0 THEN
    DELETE FROM workflow_edges
    WHERE id = ANY(p_removed_edge_ids)
      AND workflow_id = p_workflow_id;
  END IF;

  -- ── 3. Upsert nodes ─────────────────────────────────────────
  FOR v_node_rec IN SELECT * FROM jsonb_array_elements(p_nodes)
  LOOP
    INSERT INTO workflow_nodes (
      id, workflow_id, workflow_version_id, node_key, node_type,
      node_category, label, description, position_x, position_y,
      width, height, config, data, is_enabled, retry_limit,
      timeout_ms, on_failure, step_position, has_breakpoint,
      created_at, updated_at
    ) VALUES (
      (v_node_rec->>'id')::UUID,
      p_workflow_id,
      NULLIF((v_node_rec->>'workflow_version_id')::UUID, '00000000-0000-0000-0000-000000000000'::UUID),
      v_node_rec->>'node_key',
      v_node_rec->>'node_type',
      (v_node_rec->>'node_category')::node_category,
      COALESCE(v_node_rec->>'label', ''),
      COALESCE(v_node_rec->>'description', ''),
      COALESCE((v_node_rec->>'position_x')::DOUBLE PRECISION, 0),
      COALESCE((v_node_rec->>'position_y')::DOUBLE PRECISION, 0),
      COALESCE((v_node_rec->>'width')::DOUBLE PRECISION, 240),
      COALESCE((v_node_rec->>'height')::DOUBLE PRECISION, 80),
      COALESCE(v_node_rec->'config', '{}'),
      COALESCE(v_node_rec->'data', '{}'),
      COALESCE((v_node_rec->>'is_enabled')::BOOLEAN, TRUE),
      COALESCE((v_node_rec->>'retry_limit')::INT, 0),
      COALESCE((v_node_rec->>'timeout_ms')::INT, 30000),
      COALESCE(v_node_rec->>'on_failure', 'stop'),
      COALESCE((v_node_rec->>'step_position')::INT, 0),
      COALESCE((v_node_rec->>'has_breakpoint')::BOOLEAN, FALSE),
      COALESCE((v_node_rec->>'created_at')::TIMESTAMPTZ, now()),
      now()
    ) ON CONFLICT (id) DO UPDATE SET
      workflow_id      = EXCLUDED.workflow_id,
      node_key        = EXCLUDED.node_key,
      node_type       = EXCLUDED.node_type,
      node_category   = EXCLUDED.node_category,
      label           = EXCLUDED.label,
      description     = EXCLUDED.description,
      position_x      = EXCLUDED.position_x,
      position_y      = EXCLUDED.position_y,
      width           = EXCLUDED.width,
      height          = EXCLUDED.height,
      config          = EXCLUDED.config,
      data            = EXCLUDED.data,
      is_enabled      = EXCLUDED.is_enabled,
      retry_limit     = EXCLUDED.retry_limit,
      timeout_ms      = EXCLUDED.timeout_ms,
      on_failure      = EXCLUDED.on_failure,
      step_position   = EXCLUDED.step_position,
      has_breakpoint  = EXCLUDED.has_breakpoint,
      updated_at      = now();

    v_node_count := v_node_count + 1;
  END LOOP;

  -- ── 4. Upsert edges ─────────────────────────────────────────
  FOR v_edge_rec IN SELECT * FROM jsonb_array_elements(p_edges)
  LOOP
    INSERT INTO workflow_edges (
      id, workflow_id, workflow_version_id, edge_key,
      source_node_id, source_handle, target_node_id,
      target_handle, label, edge_type, is_valid, data,
      created_at, updated_at
    ) VALUES (
      (v_edge_rec->>'id')::UUID,
      p_workflow_id,
      NULLIF((v_edge_rec->>'workflow_version_id')::UUID, '00000000-0000-0000-0000-000000000000'::UUID),
      v_edge_rec->>'edge_key',
      (v_edge_rec->>'source_node_id')::UUID,
      COALESCE(v_edge_rec->>'source_handle', 'output'),
      (v_edge_rec->>'target_node_id')::UUID,
      COALESCE(v_edge_rec->>'target_handle', 'input'),
      COALESCE(v_edge_rec->>'label', ''),
      COALESCE(v_edge_rec->>'edge_type', 'default'),
      COALESCE((v_edge_rec->>'is_valid')::BOOLEAN, TRUE),
      COALESCE(v_edge_rec->'data', '{}'),
      COALESCE((v_edge_rec->>'created_at')::TIMESTAMPTZ, now()),
      now()
    ) ON CONFLICT (id) DO UPDATE SET
      workflow_id    = EXCLUDED.workflow_id,
      edge_key       = EXCLUDED.edge_key,
      source_node_id = EXCLUDED.source_node_id,
      source_handle  = EXCLUDED.source_handle,
      target_node_id = EXCLUDED.target_node_id,
      target_handle  = EXCLUDED.target_handle,
      label          = EXCLUDED.label,
      edge_type      = EXCLUDED.edge_type,
      is_valid       = EXCLUDED.is_valid,
      data           = EXCLUDED.data,
      updated_at     = now();

    v_edge_count := v_edge_count + 1;
  END LOOP;

  -- ── 5. Upsert layout ────────────────────────────────────────
  IF p_layout IS NOT NULL AND jsonb_typeof(p_layout) = 'object' THEN
    v_layout_viewport_x := COALESCE((p_layout->>'viewport_x')::DOUBLE PRECISION, 0);
    v_layout_viewport_y := COALESCE((p_layout->>'viewport_y')::DOUBLE PRECISION, 0);
    v_layout_zoom       := COALESCE((p_layout->>'zoom')::DOUBLE PRECISION, 1);
    v_layout_collapsed  := COALESCE(p_layout->'collapsed_panels', '[]'::JSONB);

    -- Check for existing layout for this user+workflow
    SELECT id INTO v_layout_id
    FROM workflow_layouts
    WHERE workflow_id = p_workflow_id AND user_id = p_user_id
    LIMIT 1;

    IF v_layout_id IS NOT NULL THEN
      UPDATE workflow_layouts SET
        viewport_x      = v_layout_viewport_x,
        viewport_y      = v_layout_viewport_y,
        zoom_level      = v_layout_zoom,
        collapsed_panels = v_layout_collapsed,
        updated_at      = now()
      WHERE id = v_layout_id;
    ELSE
      INSERT INTO workflow_layouts (
        id, workflow_id, user_id, viewport_x, viewport_y,
        zoom_level, collapsed_panels, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        p_workflow_id,
        p_user_id,
        v_layout_viewport_x,
        v_layout_viewport_y,
        v_layout_zoom,
        v_layout_collapsed,
        now(),
        now()
      );
    END IF;
  END IF;

  -- ── Return success ─────────────────────────────────────────
  RETURN jsonb_build_object(
    'success', true,
    'node_count', v_node_count,
    'edge_count', v_edge_count
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Grant execute to authenticated users ────────────────────────
GRANT EXECUTE ON FUNCTION save_workflow_canvas_atomic TO authenticated;
