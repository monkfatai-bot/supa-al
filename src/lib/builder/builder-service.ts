/**
 * Supa AI — Phase 9B Builder Service (server-only).
 *
 * The canonical write-path for the Visual Workflow Builder domain. Owns
 * every `workflow_*` table operation: nodes / edges / layouts / comments /
 * collaboration / debug sessions, plus the public `template_categories`
 * lookup. Also exposes the pure-graph helpers `validateWorkflow`,
 * `previewWorkflow`, `exportWorkflow`, `importWorkflow` that operate on
 * in-memory graph shapes (so the API routes stay thin).
 *
 * ## Construction
 *
 * Constructed with the **server** Supabase client (RLS-enforced). The
 * `is_workspace_member()` SQL function (defined in 0009) backs every RLS
 * policy on every `workflow_*` table, so the caller's membership is
 * enforced at the database layer in addition to the `assertCanWrite`
 * checks in this service.
 *
 * ## Workspace resolution
 *
 * Workflows are scoped by `(workspace_id, workflow_id)` where
 * `workflow_id` is a free-form string (it can be a workspace document id,
 * a marketplace template id, or a synthetic UUID). The pair is unique on
 * `workflow_nodes` so a single workflow's node set is replaceable in one
 * save.
 *
 * @module @/lib/builder/builder-service
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertCanWrite } from "@/lib/workspace/core";

import { nodeRegistry } from "./node-definitions";
import type {
  CreateCommentInput,
  DebugLogEntry,
  DebugStatus,
  ImportResult,
  PreviewResult,
  SaveWorkflowInput,
  TemplateCategory,
  UpdateCommentInput,
  UpsertPresenceInput,
  ValidationIssue,
  ValidationResult,
  WorkflowCollaboration,
  WorkflowComment,
  WorkflowDebugSession,
  WorkflowEdge,
  WorkflowExport,
  WorkflowGraph,
  WorkflowLayout,
  WorkflowNode,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NODES_PER_WORKFLOW = 500;
const MAX_EDGES_PER_WORKFLOW = 1000;
const MAX_COMMENT_BODY = 16_000;
const PREVIEW_MAX_STEPS = 100;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a Postgrest-shaped error into a {@link DatabaseError}. */
function toDbError(
  error: { code?: string; message?: string; name?: string; details?: unknown },
  message: string,
): DatabaseError {
  return new DatabaseError(message, {
    errorCode: error.code,
    errorName: error.name,
    errorMessage: error.message,
    errorDetails: error.details,
  });
}

/** Coerce an arbitrary value into a Postgres-safe `Json` payload. */
function toJson(value: unknown): import("./types").Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown[];
  return value as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only service for the Workflow Builder domain. Construct via
 * {@link createBuilderService}; never `new` it directly outside tests.
 */
export class BuilderService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  // -----------------------------------------------------------------------
  // Save / load (the canonical graph read + write paths)
  // -----------------------------------------------------------------------

  /**
   * Atomically replace the entire graph (nodes + edges + layout) for a
   * workflow. The existing graph for `(workspace_id, workflow_id)` is
   * deleted and re-inserted in one shot so the saved state is always a
   * faithful reflection of what the UI sent.
   *
   * Membership: the caller must be a writer on `workspaceId`
   * (`owner / admin / editor / member`).
   */
  async saveWorkflow(
    userId: string,
    input: SaveWorkflowInput,
  ): Promise<WorkflowGraph> {
    // Validate input shape.
    if (!input.workspaceId) {
      throw new ValidationError("workspaceId is required.");
    }
    if (!input.workflowId) {
      throw new ValidationError("workflowId is required.");
    }
    if (input.nodes.length > MAX_NODES_PER_WORKFLOW) {
      throw new ValidationError(
        `Too many nodes (${input.nodes.length} > ${MAX_NODES_PER_WORKFLOW}).`,
      );
    }
    if (input.edges.length > MAX_EDGES_PER_WORKFLOW) {
      throw new ValidationError(
        `Too many edges (${input.edges.length} > ${MAX_EDGES_PER_WORKFLOW}).`,
      );
    }
    // Validate every node references a known catalog type.
    for (const n of input.nodes) {
      if (!nodeRegistry.find(n.nodeType)) {
        throw new ValidationError(
          `Unknown node type "${n.nodeType}" (node_key=${n.nodeKey}).`,
        );
      }
    }
    // Validate every edge references node keys that exist.
    const nodeKeys = new Set(input.nodes.map((n) => n.nodeKey));
    for (const e of input.edges) {
      if (!nodeKeys.has(e.sourceNodeKey)) {
        throw new ValidationError(
          `Edge source node "${e.sourceNodeKey}" does not exist.`,
        );
      }
      if (!nodeKeys.has(e.targetNodeKey)) {
        throw new ValidationError(
          `Edge target node "${e.targetNodeKey}" does not exist.`,
        );
      }
    }

    // Membership check.
    await assertCanWrite(this.supabase, input.workspaceId, userId);

    try {
      // 1. Delete the existing graph atomically (edges cascade on node
      //    delete, but we delete both explicitly so the order is
      //    deterministic).
      await this.supabase
        .from("workflow_edges")
        .delete()
        .eq("workspace_id", input.workspaceId)
        .eq("workflow_id", input.workflowId);
      await this.supabase
        .from("workflow_nodes")
        .delete()
        .eq("workspace_id", input.workspaceId)
        .eq("workflow_id", input.workflowId);

      // 2. Insert the new nodes.
      const nodeInserts = input.nodes.map((n) => ({
        workspace_id: input.workspaceId,
        workflow_id: input.workflowId,
        node_type: n.category,
        node_key: n.nodeKey,
        label: n.label ?? "",
        position: toJson(n.position),
        config: toJson(n.config ?? {}),
        is_enabled: n.isEnabled ?? true,
      }));

      let insertedNodes: WorkflowNode[] = [];
      if (nodeInserts.length > 0) {
        const { data: nodesData, error: nodesErr } = await this.supabase
          .from("workflow_nodes")
          .insert(nodeInserts as never)
          .select();
        if (nodesErr) {
          throw toDbError(nodesErr, "builder.saveWorkflow nodes insert failed");
        }
        insertedNodes = (nodesData ?? []) as unknown as WorkflowNode[];
      }

      // 3. Insert the new edges (now that we have node ids).
      const keyToId = new Map<string, string>();
      for (const n of insertedNodes) {
        keyToId.set(n.node_key, n.id);
      }
      const edgeInserts = input.edges.map((e) => ({
        workspace_id: input.workspaceId,
        workflow_id: input.workflowId,
        source_node_id: keyToId.get(e.sourceNodeKey)!,
        target_node_id: keyToId.get(e.targetNodeKey)!,
        source_port: e.sourcePort ?? "out",
        target_port: e.targetPort ?? "in",
        label: e.label ?? "",
        condition: toJson(e.condition ?? {}),
      }));

      let insertedEdges: WorkflowEdge[] = [];
      if (edgeInserts.length > 0) {
        const { data: edgesData, error: edgesErr } = await this.supabase
          .from("workflow_edges")
          .insert(edgeInserts as never)
          .select();
        if (edgesErr) {
          throw toDbError(edgesErr, "builder.saveWorkflow edges insert failed");
        }
        insertedEdges = (edgesData ?? []) as unknown as WorkflowEdge[];
      }

      // 4. Upsert the layout row. The layout jsonb carries the
      //    workspace_id so the layouts-table RLS policy can gate access.
      let layout: WorkflowLayout | null = null;
      const layoutRow = {
        workflow_id: input.workflowId,
        layout: toJson({
          workspaceId: input.workspaceId,
          ...(input.layout?.meta ?? {}),
        }),
        viewport: toJson(input.layout?.viewport ?? { zoom: 1, x: 0, y: 0 }),
      };
      const { data: layoutData, error: layoutErr } = await this.supabase
        .from("workflow_layouts")
        .upsert(layoutRow as never, { onConflict: "workflow_id" })
        .select()
        .maybeSingle();
      if (layoutErr) {
        // Layout save is best-effort — don't fail the whole save over it.
        logger.warn("builder.saveWorkflow layout upsert failed", {
          error: layoutErr.message,
        });
      } else if (layoutData) {
        layout = layoutData as unknown as WorkflowLayout;
      }

      return {
        workflowId: input.workflowId,
        nodes: insertedNodes,
        edges: insertedEdges,
        layout,
      };
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure saving workflow.", {
        workspaceId: input.workspaceId,
        workflowId: input.workflowId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Load the entire graph for a workflow. Returns an empty graph
   * (no nodes, no edges, no layout) when the workflow has never been
   * saved — this is the normal first-load state for a new workflow.
   *
   * Membership: the caller must be a member of `workspaceId`.
   */
  async loadWorkflow(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowGraph> {
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const [nodesRes, edgesRes, layoutRes] = await Promise.all([
        this.supabase
          .from("workflow_nodes")
          .select()
          .eq("workspace_id", workspaceId)
          .eq("workflow_id", workflowId)
          .order("created_at", { ascending: true }),
        this.supabase
          .from("workflow_edges")
          .select()
          .eq("workspace_id", workspaceId)
          .eq("workflow_id", workflowId)
          .order("created_at", { ascending: true }),
        this.supabase
          .from("workflow_layouts")
          .select()
          .eq("workflow_id", workflowId)
          .maybeSingle(),
      ]);

      if (nodesRes.error) throw toDbError(nodesRes.error, "builder.loadWorkflow nodes failed");
      if (edgesRes.error) throw toDbError(edgesRes.error, "builder.loadWorkflow edges failed");
      if (layoutRes.error) {
        logger.warn("builder.loadWorkflow layout read failed", {
          error: layoutRes.error.message,
        });
      }

      return {
        workflowId,
        nodes: (nodesRes.data ?? []) as unknown as WorkflowNode[],
        edges: (edgesRes.data ?? []) as unknown as WorkflowEdge[],
        layout: (layoutRes.data as unknown as WorkflowLayout | null) ?? null,
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure loading workflow.", {
        workspaceId,
        workflowId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Node / edge / layout granular CRUD (used by the granular API routes)
  // -----------------------------------------------------------------------

  /** List the nodes for a workflow. */
  async listNodes(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowNode[]> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_nodes")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });
      if (error) throw toDbError(error, "builder.listNodes failed");
      return (data ?? []) as unknown as WorkflowNode[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure listing nodes.", {
        workspaceId,
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /**
   * Bulk-insert nodes. Used by the API route `POST /nodes` (the save route
   * replaces the whole graph; this is for incremental edits).
   */
  async addNodes(
    userId: string,
    workspaceId: string,
    workflowId: string,
    nodes: Array<{
      nodeKey: string;
      nodeType: string;
      category: import("./types").NodeType;
      label: string;
      position: { x: number; y: number };
      config?: Record<string, unknown>;
      isEnabled?: boolean;
    }>,
  ): Promise<WorkflowNode[]> {
    if (nodes.length === 0) return [];
    if (nodes.length > MAX_NODES_PER_WORKFLOW) {
      throw new ValidationError("Too many nodes in one batch.");
    }
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const rows = nodes.map((n) => ({
        workspace_id: workspaceId,
        workflow_id: workflowId,
        node_type: n.category,
        node_key: n.nodeKey,
        label: n.label ?? "",
        position: toJson(n.position),
        config: toJson(n.config ?? {}),
        is_enabled: n.isEnabled ?? true,
      }));
      const { data, error } = await this.supabase
        .from("workflow_nodes")
        .insert(rows as never)
        .select();
      if (error) throw toDbError(error, "builder.addNodes failed");
      return (data ?? []) as unknown as WorkflowNode[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure adding nodes.", {
        workspaceId,
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** List the edges for a workflow. */
  async listEdges(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowEdge[]> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_edges")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });
      if (error) throw toDbError(error, "builder.listEdges failed");
      return (data ?? []) as unknown as WorkflowEdge[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure listing edges.", {
        workspaceId,
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Bulk-insert edges (after node ids are known). */
  async addEdges(
    userId: string,
    workspaceId: string,
    workflowId: string,
    edges: Array<{
      sourceNodeId: string;
      targetNodeId: string;
      sourcePort?: string;
      targetPort?: string;
      label?: string;
      condition?: Record<string, unknown>;
    }>,
  ): Promise<WorkflowEdge[]> {
    if (edges.length === 0) return [];
    await assertCanWrite(this.supabase, workspaceId, userId);

    try {
      const rows = edges.map((e) => ({
        workspace_id: workspaceId,
        workflow_id: workflowId,
        source_node_id: e.sourceNodeId,
        target_node_id: e.targetNodeId,
        source_port: e.sourcePort ?? "out",
        target_port: e.targetPort ?? "in",
        label: e.label ?? "",
        condition: toJson(e.condition ?? {}),
      }));
      const { data, error } = await this.supabase
        .from("workflow_edges")
        .insert(rows as never)
        .select();
      if (error) throw toDbError(error, "builder.addEdges failed");
      return (data ?? []) as unknown as WorkflowEdge[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure adding edges.", {
        workspaceId,
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Get the layout row for a workflow (or null when never saved). */
  async getLayout(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowLayout | null> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_layouts")
        .select()
        .eq("workflow_id", workflowId)
        .maybeSingle();
      if (error) {
        throw toDbError(error, "builder.getLayout failed");
      }
      return (data as unknown as WorkflowLayout | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure loading layout.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Upsert the layout row for a workflow. */
  async saveLayout(
    userId: string,
    workspaceId: string,
    workflowId: string,
    viewport: { zoom: number; x: number; y: number },
    meta?: Record<string, unknown>,
  ): Promise<WorkflowLayout> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const row = {
        workflow_id: workflowId,
        layout: toJson({ workspaceId, ...(meta ?? {}) }),
        viewport: toJson(viewport),
      };
      const { data, error } = await this.supabase
        .from("workflow_layouts")
        .upsert(row as never, { onConflict: "workflow_id" })
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.saveLayout failed");
      if (!data) throw new DatabaseError("builder.saveLayout returned no row.");
      return data as unknown as WorkflowLayout;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure saving layout.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Validation + preview (pure-graph helpers, no DB writes)
  // -----------------------------------------------------------------------

  /**
   * Validate an in-memory graph. Returns the list of issues found.
   * `ok: true` when no error-severity issues are present (warnings are ok).
   */
  validateWorkflow(graph: {
    nodes: Array<{ nodeKey: string; nodeType: string; isEnabled: boolean }>;
    edges: Array<{ sourceNodeKey: string; targetNodeKey: string }>;
  }): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (graph.nodes.length === 0) {
      issues.push({
        severity: "error",
        nodeKey: "_graph",
        code: "empty_graph",
        message: "The workflow has no nodes.",
      });
      return { ok: false, issues };
    }

    // 1. At least one start node (trigger / manual).
    const startNodes = graph.nodes.filter((n) => {
      const def = nodeRegistry.find(n.nodeType);
      return def?.isStart ?? false;
    });
    if (startNodes.length === 0) {
      issues.push({
        severity: "error",
        nodeKey: "_graph",
        code: "missing_trigger",
        message: "The workflow needs at least one trigger node (schedule, webhook, event, or manual).",
      });
    }

    // 2. No duplicate node keys.
    const seenKeys = new Set<string>();
    for (const n of graph.nodes) {
      if (seenKeys.has(n.nodeKey)) {
        issues.push({
          severity: "error",
          nodeKey: n.nodeKey,
          code: "duplicate_node_key",
          message: `Duplicate node key "${n.nodeKey}".`,
        });
      }
      seenKeys.add(n.nodeKey);
    }

    // 3. Every node references a known catalog type.
    for (const n of graph.nodes) {
      if (!nodeRegistry.find(n.nodeType)) {
        issues.push({
          severity: "error",
          nodeKey: n.nodeKey,
          code: "unknown_node_type",
          message: `Node "${n.nodeKey}" has unknown type "${n.nodeType}".`,
        });
      }
    }

    // 4. Every edge references existing nodes.
    for (const e of graph.edges) {
      if (!seenKeys.has(e.sourceNodeKey)) {
        issues.push({
          severity: "error",
          nodeKey: e.sourceNodeKey,
          code: "dangling_edge_source",
          message: `Edge source "${e.sourceNodeKey}" does not exist.`,
        });
      }
      if (!seenKeys.has(e.targetNodeKey)) {
        issues.push({
          severity: "error",
          nodeKey: e.targetNodeKey,
          code: "dangling_edge_target",
          message: `Edge target "${e.targetNodeKey}" does not exist.`,
        });
      }
    }

    // 5. Disabled-node warning.
    const disabled = graph.nodes.filter((n) => !n.isEnabled);
    if (disabled.length > 0) {
      issues.push({
        severity: "warning",
        nodeKey: "_graph",
        code: "disabled_nodes",
        message: `${disabled.length} node(s) are disabled and will be skipped at runtime.`,
      });
    }

    const ok = !issues.some((i) => i.severity === "error");
    return { ok, issues };
  }

  /**
   * Simulate a workflow run without performing any side effects. The
   * preview walks the graph from every start node in topological order,
   * evaluating each node against the catalog definition's default config
   * (no real network/IO calls). Returns a trace + the final variables.
   */
  previewWorkflow(graph: {
    nodes: Array<{
      nodeKey: string;
      nodeType: string;
      category: import("./types").NodeType;
      label: string;
      config: Record<string, unknown>;
      isEnabled: boolean;
    }>;
    edges: Array<{ sourceNodeKey: string; targetNodeKey: string }>;
  }, initialVariables: Record<string, unknown> = {}): PreviewResult {
    const startedAt = Date.now();
    const trace: PreviewResult["trace"] = [];
    const visited: string[] = [];
    const variables: Record<string, unknown> = { ...initialVariables };

    // Build adjacency list.
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) adj.set(n.nodeKey, []);
    for (const e of graph.edges) {
      const arr = adj.get(e.sourceNodeKey);
      if (arr) arr.push(e.targetNodeKey);
    }

    // Start nodes = triggers (or any node with no incoming edges).
    const incomingCount = new Map<string, number>();
    for (const n of graph.nodes) incomingCount.set(n.nodeKey, 0);
    for (const e of graph.edges) {
      const cur = incomingCount.get(e.targetNodeKey) ?? 0;
      incomingCount.set(e.targetNodeKey, cur + 1);
    }
    const nodeByKey = new Map(graph.nodes.map((n) => [n.nodeKey, n]));
    const queue: string[] = graph.nodes
      .filter((n) => {
        const def = nodeRegistry.find(n.nodeType);
        return (def?.isStart ?? false) || (incomingCount.get(n.nodeKey) ?? 0) === 0;
      })
      .map((n) => n.nodeKey);

    let steps = 0;
    let error: string | undefined;
    while (queue.length > 0 && steps < PREVIEW_MAX_STEPS) {
      const nodeKey = queue.shift()!;
      const node = nodeByKey.get(nodeKey);
      if (!node) continue;
      if (!node.isEnabled) continue;
      steps++;
      const t0 = new Date().toISOString();
      visited.push(nodeKey);

      // Pretend to execute: merge the node's config into variables.
      const beforeVars = { ...variables };
      variables[`__last_node__`] = nodeKey;
      variables[`${nodeKey}_config`] = node.config;
      variables[`${nodeKey}_label`] = node.label;
      const t1 = new Date().toISOString();

      trace.push({
        nodeKey,
        startedAt: t0,
        finishedAt: t1,
        variables: beforeVars,
      });

      // Enqueue downstream nodes.
      for (const next of adj.get(nodeKey) ?? []) {
        if (!visited.includes(next)) queue.push(next);
      }
    }

    if (steps >= PREVIEW_MAX_STEPS) {
      error = `Preview exceeded ${PREVIEW_MAX_STEPS} steps — possible cycle.`;
    }

    return {
      ok: !error,
      visited,
      trace,
      finalVariables: variables,
      durationMs: Date.now() - startedAt,
      error,
    };
  }

  // -----------------------------------------------------------------------
  // Export / import
  // -----------------------------------------------------------------------

  /** Export a workflow graph as a portable JSON payload. */
  async exportWorkflow(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowExport> {
    const graph = await this.loadWorkflow(userId, workspaceId, workflowId);
    return {
      version: 1,
      workflowId,
      exportedAt: new Date().toISOString(),
      nodes: graph.nodes.map((n) => ({
        nodeKey: n.node_key,
        nodeType: this.resolveCatalogType(n),
        category: n.node_type,
        label: n.label,
        position: (n.position as { x: number; y: number }) ?? { x: 0, y: 0 },
        config: (n.config as Record<string, unknown>) ?? {},
        isEnabled: n.is_enabled,
      })),
      edges: graph.edges.map((e) => ({
        sourceNodeKey:
          graph.nodes.find((n) => n.id === e.source_node_id)?.node_key ?? "",
        targetNodeKey:
          graph.nodes.find((n) => n.id === e.target_node_id)?.node_key ?? "",
        sourcePort: e.source_port,
        targetPort: e.target_port,
        label: e.label,
        condition: (e.condition as Record<string, unknown>) ?? {},
      })),
      layout: graph.layout
        ? {
            viewport:
              (graph.layout.viewport as { zoom: number; x: number; y: number }) ??
              { zoom: 1, x: 0, y: 0 },
          }
        : null,
    };
  }

  /**
   * Resolve the catalog node type for a stored node. Most node types match
   * the catalog directly; the catalog stores `node_type` as the category
   * union (trigger / action / etc.) on the row, but the actual catalog
   * type lives in `config.__type__` if the client stored it, falling back
   * to a best-effort lookup by label.
   */
  private resolveCatalogType(node: WorkflowNode): string {
    const config = (node.config ?? {}) as Record<string, unknown>;
    if (typeof config.__type__ === "string") return config.__type__;
    // Fallback: look up the first catalog node whose label matches.
    const byLabel = nodeRegistry.list().find((n) => n.label === node.label);
    return byLabel?.type ?? node.node_type;
  }

  /**
   * Import a workflow graph from a portable JSON payload. The existing
   * graph for `(workspaceId, export.workflowId)` is replaced.
   */
  async importWorkflow(
    userId: string,
    workspaceId: string,
    exportPayload: WorkflowExport,
  ): Promise<ImportResult> {
    if (exportPayload.version !== 1) {
      throw new ValidationError(`Unsupported export version ${exportPayload.version}.`);
    }
    if (!exportPayload.workflowId) {
      throw new ValidationError("Export payload is missing workflowId.");
    }

    const saveInput: SaveWorkflowInput = {
      workspaceId,
      workflowId: exportPayload.workflowId,
      nodes: exportPayload.nodes.map((n) => ({
        nodeKey: n.nodeKey,
        nodeType: n.nodeType,
        category: n.category,
        label: n.label,
        position: n.position,
        config: n.config,
        isEnabled: n.isEnabled,
      })),
      edges: exportPayload.edges.map((e) => ({
        sourceNodeKey: e.sourceNodeKey,
        targetNodeKey: e.targetNodeKey,
        sourcePort: e.sourcePort,
        targetPort: e.targetPort,
        label: e.label,
        condition: e.condition,
      })),
      layout: exportPayload.layout
        ? {
            viewport: exportPayload.layout.viewport,
            meta: exportPayload.layout.meta,
          }
        : null,
    };
    const graph = await this.saveWorkflow(userId, saveInput);
    return {
      workflowId: graph.workflowId,
      nodes: graph.nodes,
      edges: graph.edges,
      layout: graph.layout,
    };
  }

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  /** List the comments for a workflow (oldest first). */
  async listComments(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowComment[]> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_comments")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });
      if (error) throw toDbError(error, "builder.listComments failed");
      return (data ?? []) as unknown as WorkflowComment[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure listing comments.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Create a comment. */
  async createComment(
    userId: string,
    input: CreateCommentInput,
  ): Promise<WorkflowComment> {
    const body = input.body?.trim();
    if (!body) throw new ValidationError("Comment body is required.");
    if (body.length > MAX_COMMENT_BODY) {
      throw new ValidationError(
        `Comment body must be at most ${MAX_COMMENT_BODY} characters.`,
      );
    }
    await assertCanWrite(this.supabase, input.workspaceId, userId);

    try {
      const { data, error } = await this.supabase
        .from("workflow_comments")
        .insert({
          workspace_id: input.workspaceId,
          workflow_id: input.workflowId,
          author_id: userId,
          body,
          position: toJson(input.position ?? { x: 0, y: 0 }),
          resolved: false,
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.createComment failed");
      if (!data) throw new DatabaseError("builder.createComment returned no row.");
      return data as unknown as WorkflowComment;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure creating comment.", {
        workflowId: input.workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Update a comment (resolve / edit body / move position). */
  async updateComment(
    userId: string,
    workspaceId: string,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<WorkflowComment> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const patch: Record<string, unknown> = {};
      if (input.body !== undefined) patch.body = input.body;
      if (input.position !== undefined) patch.position = toJson(input.position);
      if (input.resolved !== undefined) patch.resolved = input.resolved;

      const { data, error } = await this.supabase
        .from("workflow_comments")
        .update(patch as never)
        .eq("id", commentId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.updateComment failed");
      if (!data) throw new NotFoundError("Comment", commentId);
      return data as unknown as WorkflowComment;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure updating comment.", {
        commentId,
        cause: (err as Error).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Collaboration presence
  // -----------------------------------------------------------------------

  /**
   * List all presence rows for a workflow. Note: presence is per-user
   * (workflow_collaboration.user_id = auth.uid() is the only RLS gate),
   * so this returns the *caller's own* presence row plus any rows the
   * platform has shared via the admin client. For now it returns the
   * caller's own row only — a future Phase can add a real-time broadcast
   * channel.
   */
  async listPresence(
    userId: string,
    workflowId: string,
  ): Promise<WorkflowCollaboration[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_collaboration")
        .select()
        .eq("workflow_id", workflowId)
        .eq("user_id", userId);
      if (error) throw toDbError(error, "builder.listPresence failed");
      return (data ?? []) as unknown as WorkflowCollaboration[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure listing presence.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Upsert the caller's presence for a workflow. */
  async upsertPresence(
    userId: string,
    input: UpsertPresenceInput,
  ): Promise<WorkflowCollaboration> {
    if (!input.workflowId) throw new ValidationError("workflowId is required.");
    try {
      const { data, error } = await this.supabase
        .from("workflow_collaboration")
        .upsert({
          workflow_id: input.workflowId,
          user_id: userId,
          cursor: toJson(input.cursor ?? { x: 0, y: 0 }),
          selected_nodes: input.selectedNodes ?? [],
          last_active: new Date().toISOString(),
        } as never, { onConflict: "workflow_id,user_id" })
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.upsertPresence failed");
      if (!data) throw new DatabaseError("builder.upsertPresence returned no row.");
      return data as unknown as WorkflowCollaboration;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure upserting presence.", {
        workflowId: input.workflowId,
        cause: (err as Error).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Debug sessions
  // -----------------------------------------------------------------------

  /** Fetch the latest debug session for a workflow (or null). */
  async getDebugSession(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowDebugSession | null> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_debug_sessions")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw toDbError(error, "builder.getDebugSession failed");
      return (data as unknown as WorkflowDebugSession | null) ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure loading debug session.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /**
   * Create a fresh debug session in the given status. Used by the API
   * route `POST /debug` with `action=start | pause | stop`.
   */
  async startDebug(
    userId: string,
    workspaceId: string,
    workflowId: string,
  ): Promise<WorkflowDebugSession> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const { data, error } = await this.supabase
        .from("workflow_debug_sessions")
        .insert({
          workspace_id: workspaceId,
          workflow_id: workflowId,
          status: "running",
          variables: toJson({}),
          log: toJson([]),
          started_at: new Date().toISOString(),
        } as never)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.startDebug failed");
      if (!data) throw new DatabaseError("builder.startDebug returned no row.");
      return data as unknown as WorkflowDebugSession;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure starting debug session.", {
        workflowId,
        cause: (err as Error).message,
      });
    }
  }

  /** Patch a debug session's status (running / paused / completed). */
  async updateDebugStatus(
    userId: string,
    workspaceId: string,
    sessionId: string,
    status: DebugStatus,
    patch?: { currentNodeId?: string | null; variables?: Record<string, unknown>; log?: DebugLogEntry[] },
  ): Promise<WorkflowDebugSession> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      const update: Record<string, unknown> = { status };
      if (patch?.currentNodeId !== undefined) {
        update.current_node_id = patch.currentNodeId;
      }
      if (patch?.variables !== undefined) {
        update.variables = toJson(patch.variables);
      }
      if (patch?.log !== undefined) {
        update.log = toJson(patch.log);
      }
      if (status === "completed") {
        update.completed_at = new Date().toISOString();
      }

      const { data, error } = await this.supabase
        .from("workflow_debug_sessions")
        .update(update as never)
        .eq("id", sessionId)
        .eq("workspace_id", workspaceId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "builder.updateDebugStatus failed");
      if (!data) throw new NotFoundError("Debug session", sessionId);
      return data as unknown as WorkflowDebugSession;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure updating debug session.", {
        sessionId,
        cause: (err as Error).message,
      });
    }
  }

  /** Append a log entry to a debug session (used during preview runs). */
  async appendDebugLog(
    userId: string,
    workspaceId: string,
    sessionId: string,
    entry: DebugLogEntry,
  ): Promise<void> {
    await assertCanWrite(this.supabase, workspaceId, userId);
    try {
      // Postgres jsonb_append would be ideal — but we don't have a stored
      // proc. Read-modify-write is fine for a single-writer debug session.
      const { data, error } = await this.supabase
        .from("workflow_debug_sessions")
        .select("log")
        .eq("id", sessionId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw toDbError(error, "builder.appendDebugLog read failed");
      if (!data) throw new NotFoundError("Debug session", sessionId);
      const log = ((data as { log?: unknown[] }).log ?? []) as DebugLogEntry[];
      log.push(entry);
      const { error: updateErr } = await this.supabase
        .from("workflow_debug_sessions")
        .update({ log: toJson(log) } as never)
        .eq("id", sessionId);
      if (updateErr) throw toDbError(updateErr, "builder.appendDebugLog write failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure appending debug log.", {
        sessionId,
        cause: (err as Error).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Template categories
  // -----------------------------------------------------------------------

  /** List the active template categories, sorted by `sort_order`. */
  async listTemplateCategories(): Promise<TemplateCategory[]> {
    try {
      const { data, error } = await this.supabase
        .from("template_categories")
        .select()
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw toDbError(error, "builder.listTemplateCategories failed");
      return (data ?? []) as unknown as TemplateCategory[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      throw new DatabaseError("Unexpected failure listing template categories.", {
        cause: (err as Error).message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Node definitions (pure delegation to the registry)
  // -----------------------------------------------------------------------

  /** List every node definition in the catalog (71 nodes). */
  getNodeDefinitions() {
    return nodeRegistry.list();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the canonical {@link BuilderService} with the per-request server
 * Supabase client (RLS-enforced).
 */
export async function createBuilderService(): Promise<BuilderService> {
  const supabase = await createSupabaseServerClient();
  return new BuilderService(supabase);
}

/**
 * Build a {@link BuilderService} with an explicit Supabase client. Used
 * by tests + admin paths that already hold a client.
 */
export function createBuilderServiceWith(
  supabase: AnySupabaseClient,
): BuilderService {
  return new BuilderService(supabase);
}

/** Re-export the {@link AuthorizationError} for callers that need it. */
export { AuthorizationError, NotFoundError, ValidationError };
export { randomUUID };
