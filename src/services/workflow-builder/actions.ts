'use server';

import { revalidatePath } from 'next/cache';
import { v4 as uuidv4 } from 'uuid';
import { createServerSupabaseClient } from '@/lib/supabase/server-client';
import { requireAuth } from '@/services/auth/session';
import { logActivity } from '@/services/activity-log/actions';
import { logger } from '@/services/logger';
import { getWorkspaceIdByWorkflowId, requireMinimumRole } from '@/lib/workspace-utils';
import type {
  WorkflowComment,
  WorkflowCollaboration,
  WorkflowTemplateCategory,
  InsertTables,
  Json,
  CollaborationRole,
  ActivityAction,
} from '@/types/generated/database';
import type { WorkflowCommentWithAuthor } from './types';

// ── Helpers ─────────────────────────────────────────────────────────────────

type MutResult = { success: boolean; error?: string };

/** Resolve workspace_id for a workflow and verify the user is a member. Returns workspace_id or null. */
async function verifyWorkspaceAccess(workflowId: string, userId: string): Promise<string | null> {
  try {
    const wsId = await getWorkspaceIdByWorkflowId(workflowId);
    if (!wsId) return null;
    const supabase = await createServerSupabaseClient();
    const { data: member } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', wsId)
      .eq('user_id', userId)
      .single();
    return member ? wsId : null;
  } catch {
    return null;
  }
}

const now = () => new Date().toISOString();

// ── Nodes ───────────────────────────────────────────────────────────────────

export async function saveWorkflowNodes(
  workflowId: string,
  nodes: InsertTables<'workflow_nodes'>[],
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error: delErr } = await supabase
    .from('workflow_nodes')
    .delete()
    .eq('workflow_id', workflowId);
  if (delErr) {
    logger.error('Failed to delete nodes for save', { workflowId, reason: delErr.message });
    return { success: false, error: delErr.message };
  }

  if (nodes.length > 0) {
    const { error: insErr } = await supabase.from('workflow_nodes').insert(nodes);
    if (insErr) {
      logger.error('Failed to insert nodes', { workflowId, reason: insErr.message });
      return { success: false, error: insErr.message };
    }
  }

  await logActivity('workspace_update' as ActivityAction, `Saved ${nodes.length} node(s) in workflow`, { workflowId }, wsId);
  return { success: true };
}

export async function addWorkflowNode(
  workflowId: string,
  node: InsertTables<'workflow_nodes'>,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('workflow_nodes').insert(node);
  if (error) {
    logger.error('Failed to add workflow node', { workflowId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('workspace_update' as ActivityAction, `Added node "${node.label ?? node.node_type}" to workflow`, { workflowId, nodeId: node.id }, wsId);
  return { success: true };
}

export async function updateWorkflowNode(
  nodeId: string,
  workflowId: string,
  updates: Partial<InsertTables<'workflow_nodes'>>,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('workflow_nodes')
    .update(updates)
    .eq('id', nodeId)
    .eq('workflow_id', workflowId);
  if (error) {
    logger.error('Failed to update workflow node', { nodeId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('workspace_update' as ActivityAction, `Updated node in workflow`, { workflowId, nodeId }, wsId);
  return { success: true };
}

export async function deleteWorkflowNodes(
  nodeIds: string[],
  workflowId: string,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'admin');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('workflow_nodes')
    .delete()
    .in('id', nodeIds)
    .eq('workflow_id', workflowId);
  if (error) {
    logger.error('Failed to delete workflow nodes', { workflowId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('workspace_update' as ActivityAction, `Deleted ${nodeIds.length} node(s) from workflow`, { workflowId, nodeIds }, wsId);
  return { success: true };
}

// ── Edges ───────────────────────────────────────────────────────────────────

export async function saveWorkflowEdges(
  workflowId: string,
  edges: InsertTables<'workflow_edges'>[],
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error: delErr } = await supabase
    .from('workflow_edges')
    .delete()
    .eq('workflow_id', workflowId);
  if (delErr) {
    logger.error('Failed to delete edges for save', { workflowId, reason: delErr.message });
    return { success: false, error: delErr.message };
  }

  if (edges.length > 0) {
    const { error: insErr } = await supabase.from('workflow_edges').insert(edges);
    if (insErr) {
      logger.error('Failed to insert edges', { workflowId, reason: insErr.message });
      return { success: false, error: insErr.message };
    }
  }

  await logActivity('workspace_update' as ActivityAction, `Saved ${edges.length} edge(s) in workflow`, { workflowId }, wsId);
  return { success: true };
}

export async function addWorkflowEdge(
  workflowId: string,
  edge: InsertTables<'workflow_edges'>,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('workflow_edges').insert(edge);
  if (error) {
    logger.error('Failed to add workflow edge', { workflowId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('workspace_update' as ActivityAction, `Added edge to workflow`, { workflowId, edgeId: edge.id }, wsId);
  return { success: true };
}

export async function deleteWorkflowEdges(
  edgeIds: string[],
  workflowId: string,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'admin');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('workflow_edges')
    .delete()
    .in('id', edgeIds)
    .eq('workflow_id', workflowId);
  if (error) {
    logger.error('Failed to delete workflow edges', { workflowId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('workspace_update' as ActivityAction, `Deleted ${edgeIds.length} edge(s) from workflow`, { workflowId, edgeIds }, wsId);
  return { success: true };
}

// ── Layout ──────────────────────────────────────────────────────────────────

export async function saveWorkflowLayout(
  workflowId: string,
  viewport: { x: number; y: number },
  zoom: number,
  collapsedPanels: Json,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const row = {
    id: uuidv4(),
    workflow_id: workflowId,
    user_id: user.id,
    viewport_x: viewport.x,
    viewport_y: viewport.y,
    zoom_level: zoom,
    collapsed_panels: collapsedPanels,
    created_at: now(),
    updated_at: now(),
  };

  const { error: upsertErr } = await supabase
    .from('workflow_layouts')
    .upsert(row, { onConflict: 'workflow_id,user_id' });
  if (upsertErr) {
    logger.error('Failed to upsert workflow layout', { workflowId, reason: upsertErr.message });
    return { success: false, error: upsertErr.message };
  }

  return { success: true };
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function addWorkflowComment(
  workflowId: string,
  content: string,
  nodeId?: string,
  parentId?: string,
  mentionedUserIds?: string[],
  position?: { x: number; y: number },
): Promise<MutResult & { comment?: WorkflowComment }> {
  const user = await requireAuth();
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();
  const insert: InsertTables<'workflow_comments'> = {
    id: uuidv4(),
    workflow_id: workflowId,
    node_id: nodeId ?? null,
    user_id: user.id,
    parent_id: parentId ?? null,
    content,
    mentioned_user_ids: mentionedUserIds ?? [],
    position_x: position?.x ?? 0,
    position_y: position?.y ?? 0,
    created_at: now(),
    updated_at: now(),
  };

  const { data, error } = await supabase
    .from('workflow_comments')
    .insert(insert)
    .select()
    .single();
  if (error || !data) {
    logger.error('Failed to add workflow comment', { workflowId, reason: error?.message });
    return { success: false, error: error?.message ?? 'Insert failed' };
  }

  await logActivity('comment_added', `Added comment on workflow`, { workflowId, commentId: data.id }, wsId);
  return { success: true, comment: data };
}

export async function resolveWorkflowComment(commentId: string): Promise<MutResult> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: comment } = await supabase
    .from('workflow_comments')
    .select('workflow_id')
    .eq('id', commentId)
    .single();
  if (!comment) return { success: false, error: 'Comment not found' };

  const wsId = await getWorkspaceIdByWorkflowId(comment.workflow_id);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const { error } = await supabase
    .from('workflow_comments')
    .update({ is_resolved: true, updated_at: now() })
    .eq('id', commentId);
  if (error) {
    logger.error('Failed to resolve workflow comment', { commentId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('comment_resolved', `Resolved workflow comment`, { commentId }, wsId);
  return { success: true };
}

export async function deleteWorkflowComment(commentId: string): Promise<MutResult> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { data: comment } = await supabase
    .from('workflow_comments')
    .select('workflow_id, user_id')
    .eq('id', commentId)
    .single();
  if (!comment) return { success: false, error: 'Comment not found' };

  const wsId = await getWorkspaceIdByWorkflowId(comment.workflow_id);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'admin');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const { error } = await supabase
    .from('workflow_comments')
    .delete()
    .eq('id', commentId);
  if (error) {
    logger.error('Failed to delete workflow comment', { commentId, reason: error.message });
    return { success: false, error: error.message };
  }

  await logActivity('comment_resolved' as ActivityAction, `Deleted workflow comment`, { commentId }, wsId);
  return { success: true };
}

export async function getWorkflowComments(
  workflowId: string,
): Promise<WorkflowCommentWithAuthor[]> {
  const user = await requireAuth();
  const wsId = await verifyWorkspaceAccess(workflowId, user.id);
  if (!wsId) return [];

  const supabase = await createServerSupabaseClient();
  const { data: comments, error } = await supabase
    .from('workflow_comments')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: true });
  if (error || !comments) return [];

  const authorIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profiles } =
    authorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', authorIds)
      : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const enrich = (c: WorkflowComment): WorkflowCommentWithAuthor => {
    const p = profileMap.get(c.user_id);
    const children = comments.filter((r) => r.parent_id === c.id);
    return {
      ...c,
      author: p ? { full_name: p.full_name, avatar_url: p.avatar_url } : undefined,
      replies: children.length > 0 ? children.map(enrich) : undefined,
    };
  };

  return comments.filter((c) => c.parent_id === null).map(enrich);
}

// ── Collaboration ───────────────────────────────────────────────────────────

export async function joinWorkflowSession(
  workflowId: string,
  role: CollaborationRole = 'viewer',
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await verifyWorkspaceAccess(workflowId, user.id);
  if (!wsId) return { success: false, error: 'Access denied' };

  const supabase = await createServerSupabaseClient();
  const { data: existing } = await supabase
    .from('workflow_collaboration')
    .select('id')
    .eq('workflow_id', workflowId)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('workflow_collaboration')
      .update({ is_active: true, role, last_seen_at: now() })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from('workflow_collaboration').insert({
      id: uuidv4(),
      workflow_id: workflowId,
      user_id: user.id,
      role,
      is_active: true,
      is_locked: false,
      last_seen_at: now(),
      joined_at: now(),
    });
    if (error) return { success: false, error: error.message };
  }

  await logActivity('member_join' as ActivityAction, `Joined workflow as ${role}`, { workflowId }, wsId);
  return { success: true };
}

export async function leaveWorkflowSession(workflowId: string): Promise<MutResult> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('workflow_collaboration')
    .update({ is_active: false, last_seen_at: now() })
    .eq('workflow_id', workflowId)
    .eq('user_id', user.id);
  if (error) {
    logger.error('Failed to leave workflow session', { workflowId, reason: error.message });
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateCursorPosition(
  workflowId: string,
  x: number,
  y: number,
): Promise<MutResult> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('workflow_collaboration')
    .update({
      last_cursor_position: { x, y },
      last_seen_at: now(),
    })
    .eq('workflow_id', workflowId)
    .eq('user_id', user.id);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

export async function getActiveCollaborators(
  workflowId: string,
): Promise<(WorkflowCollaboration & { full_name: string | null; avatar_url: string | null })[]> {
  const user = await requireAuth();
  const wsId = await verifyWorkspaceAccess(workflowId, user.id);
  if (!wsId) return [];

  const supabase = await createServerSupabaseClient();
  const { data: collabs, error } = await supabase
    .from('workflow_collaboration')
    .select('*, profiles(full_name, avatar_url)')
    .eq('workflow_id', workflowId)
    .eq('is_active', true);
  if (error || !collabs) return [];

  return collabs.map((c) => ({
    ...c,
    full_name: (c.profiles as { full_name: string | null } | null)?.full_name ?? null,
    avatar_url: (c.profiles as { avatar_url: string | null } | null)?.avatar_url ?? null,
  }));
}

// ── Template Categories ─────────────────────────────────────────────────────

export async function getTemplateCategories(): Promise<WorkflowTemplateCategory[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('workflow_template_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return data;
}

// ── Canvas Persistence (primary auto-save) — ATOMIC via RPC ────────────────

export async function saveWorkflowCanvas(
  workflowId: string,
  nodes: InsertTables<'workflow_nodes'>[],
  edges: InsertTables<'workflow_edges'>[],
  viewport: { x: number; y: number },
  zoom: number,
): Promise<MutResult> {
  const user = await requireAuth();

  // RBAC: require at least "member" role
  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { success: false, error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  // Compute diff sets for removed items
  const incomingNodeIds = new Set(nodes.map((n) => n.id));
  const incomingEdgeIds = new Set(edges.map((e) => e.id));

  const supabase = await createServerSupabaseClient();

  // Fetch existing IDs to compute removals
  const [existingNodes, existingEdges] = await Promise.all([
    supabase.from('workflow_nodes').select('id').eq('workflow_id', workflowId),
    supabase.from('workflow_edges').select('id').eq('workflow_id', workflowId),
  ]);
  const existingNodeIds = new Set((existingNodes.data ?? []).map((n) => n.id));
  const existingEdgeIds = new Set((existingEdges.data ?? []).map((e) => e.id));

  const removedNodeIds = [...existingNodeIds].filter((id) => !incomingNodeIds.has(id));
  const removedEdgeIds = [...existingEdgeIds].filter((id) => !incomingEdgeIds.has(id));

  // Build layout JSONB param
  const layoutParam = {
    viewport_x: viewport.x,
    viewport_y: viewport.y,
    zoom: zoom,
    collapsed_panels: [] as Json,
  };

  try {
    // Single atomic RPC call — the function body IS a transaction (SECURITY DEFINER bypasses RLS)
    const { data, error } = await supabase.rpc('save_workflow_canvas_atomic', {
      p_workspace_id: wsId,
      p_workflow_id: workflowId,
      p_user_id: user.id,
      p_nodes: nodes,
      p_edges: edges,
      p_layout: layoutParam,
      p_removed_node_ids: removedNodeIds.length > 0 ? removedNodeIds : null,
      p_removed_edge_ids: removedEdgeIds.length > 0 ? removedEdgeIds : null,
    });

    if (error) {
      logger.error('Canvas save: RPC failed', { workflowId, reason: error.message });
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; node_count?: number; edge_count?: number } | null;
    if (!result?.success) {
      logger.error('Canvas save: RPC returned failure', { workflowId, reason: result?.error });
      return { success: false, error: result?.error ?? 'Atomic save failed' };
    }

    await logActivity(
      'workspace_update' as ActivityAction,
      `Auto-saved canvas (${result.node_count ?? nodes.length} nodes, ${result.edge_count ?? edges.length} edges)`,
      { workflowId, nodeCount: result.node_count ?? nodes.length, edgeCount: result.edge_count ?? edges.length },
      wsId,
    );
    revalidatePath('/automation');
    return { success: true };
  } catch (error) {
    logger.error('Canvas save: unexpected error', {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Unexpected error during canvas save' };
  }
}

// ── Publish Workflow Version ──────────────────────────────────────────

export async function publishWorkflowVersion(workflowId: string): Promise<{ success?: boolean; error?: string }> {
  const user = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const wsId = await getWorkspaceIdByWorkflowId(workflowId);
  if (!wsId) return { error: 'Workflow not found' };
  try {
    await requireMinimumRole(wsId, user.id, 'admin');
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Access denied' };
  }

  const { data: workflow } = await supabase
    .from('workflows')
    .select('workspace_id, version')
    .eq('id', workflowId)
    .single();
  if (!workflow) return { error: 'Workflow not found' };

  // Get current nodes and edges
  const { data: nodes } = await supabase.from('workflow_nodes').select('*').eq('workflow_id', workflowId);
  const { data: edges } = await supabase.from('workflow_edges').select('*').eq('workflow_id', workflowId);

  // Create version
  const { error: versionError } = await supabase.from('workflow_versions').insert({
    workflow_id: workflowId,
    version_number: (workflow.version ?? 0) + 1,
    definition: { nodes: nodes ?? [], edges: edges ?? [] } as unknown as Json,
    change_summary: `Published version ${(workflow.version ?? 0) + 1}`,
    created_by: user.id,
  });
  if (versionError) return { error: versionError.message };

  // Update workflow version and status
  const { error: updateError } = await supabase.from('workflows').update({
    version: (workflow.version ?? 0) + 1,
    status: 'active',
  }).eq('id', workflowId);
  if (updateError) return { error: updateError.message };

  void logActivity(
    'workflow.publish' as ActivityAction,
    `Published workflow version ${(workflow.version ?? 0) + 1}`,
    { workflowId },
    wsId,
  );
  revalidatePath(`/automation/workflows/${workflowId}`);
  return { success: true };
}

// ── Workflow Versions — List ────────────────────────────────────────

export interface WorkflowVersionWithAuthor {
  id: string;
  workflow_id: string;
  version_number: number;
  definition: Json;
  change_summary: string;
  created_by: string;
  created_at: string;
  author?: { full_name: string | null; avatar_url: string | null };
  node_count: number;
  edge_count: number;
}

export async function getWorkflowVersions(workflowId: string): Promise<WorkflowVersionWithAuthor[]> {
  const user = await requireAuth();
  const wsId = await verifyWorkspaceAccess(workflowId, user.id);
  if (!wsId) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('version_number', { ascending: false });
  if (error || !data) return [];

  const authorIds = [...new Set(data.map((v) => v.created_by))];
  const { data: profiles } =
    authorIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', authorIds)
      : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((v) => {
    const def = v.definition as Record<string, unknown> | null;
    const nodes = Array.isArray(def?.nodes) ? (def.nodes as unknown[]) : [];
    const edges = Array.isArray(def?.edges) ? (def.edges as unknown[]) : [];
    const author = profileMap.get(v.created_by);
    return {
      ...v,
      author: author ? { full_name: author.full_name, avatar_url: author.avatar_url } : undefined,
      node_count: nodes.length,
      edge_count: edges.length,
    };
  });
}

// ── Workflow Versions — Restore ────────────────────────────────────

export async function restoreWorkflowVersion(
  workflowId: string,
  versionId: string,
): Promise<MutResult> {
  const user = await requireAuth();
  const wsId = await verifyWorkspaceAccess(workflowId, user.id);
  if (!wsId) return { success: false, error: 'Access denied' };

  // RBAC check
  try {
    await requireMinimumRole(wsId, user.id, 'member');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Access denied' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch the version definition
  const { data: version, error: verErr } = await supabase
    .from('workflow_versions')
    .select('definition, version_number')
    .eq('id', versionId)
    .eq('workflow_id', workflowId)
    .single();
  if (verErr || !version) return { success: false, error: 'Version not found' };

  const def = version.definition as Record<string, unknown> | null;
  const versionNodes = (Array.isArray(def?.nodes) ? def.nodes : []) as InsertTables<'workflow_nodes'>[];
  const versionEdges = (Array.isArray(def?.edges) ? def.edges : []) as InsertTables<'workflow_edges'>[];

  // Compute IDs to remove (everything currently on the canvas)
  const [existingNodes, existingEdges] = await Promise.all([
    supabase.from('workflow_nodes').select('id').eq('workflow_id', workflowId),
    supabase.from('workflow_edges').select('id').eq('workflow_id', workflowId),
  ]);
  const removedNodeIds = (existingNodes.data ?? []).map((n) => n.id);
  const removedEdgeIds = (existingEdges.data ?? []).map((e) => e.id);

  // Restore via atomic RPC
  const layoutParam = { viewport_x: 0, viewport_y: 0, zoom: 1, collapsed_panels: [] as Json };
  const { data, error } = await supabase.rpc('save_workflow_canvas_atomic', {
    p_workspace_id: wsId,
    p_workflow_id: workflowId,
    p_user_id: user.id,
    p_nodes: versionNodes,
    p_edges: versionEdges,
    p_layout: layoutParam,
    p_removed_node_ids: removedNodeIds.length > 0 ? removedNodeIds : null,
    p_removed_edge_ids: removedEdgeIds.length > 0 ? removedEdgeIds : null,
  });
  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string } | null;
  if (!result?.success) return { success: false, error: result?.error ?? 'Restore failed' };

  await logActivity(
    'workspace_update' as ActivityAction,
    `Restored workflow to version ${version.version_number}`,
    { workflowId, versionId, versionNumber: version.version_number },
    wsId,
  );
  revalidatePath(`/automation/workflows/${workflowId}`);
  return { success: true };
}
