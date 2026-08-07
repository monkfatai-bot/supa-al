/**
 * Supa AI — Phase 9B Visual Workflow Builder — types.
 *
 * Client-safe types shared by the builder service, API routes, and the
 * client UI. Plain TS types (no Zod, no `server-only`) so the file is safe
 * to import from client components via the `@/lib/builder/client` barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types`
 * (`Tables<'workflow_nodes'>`, etc.). The types here are the *service*
 * shape — narrower column sets, friendly camelCase field names, and
 * discriminated unions for status enums.
 *
 * @module @/lib/builder/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0012_phase9b_builder.sql)
// ---------------------------------------------------------------------------

/** Top-level node category — see `workflow_nodes.node_type` CHECK. */
export type NodeType =
  | "trigger"
  | "action"
  | "condition"
  | "transform"
  | "ai"
  | "integration"
  | "output";

/** Lifecycle of a workflow debug session — see `workflow_debug_sessions.status`. */
export type DebugStatus = "idle" | "running" | "paused" | "completed";

// ---------------------------------------------------------------------------
// Canvas coordinate types
// ---------------------------------------------------------------------------

/** A 2D point on the canvas (in canvas coordinates, not viewport pixels). */
export interface CanvasPoint {
  x: number;
  y: number;
}

/** The canvas viewport — `zoom` is a scale factor (1 = 100%). */
export interface Viewport {
  zoom: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `workflow_nodes`. */
export type WorkflowNode = Tables<"workflow_nodes">;
/** Full row of `workflow_edges`. */
export type WorkflowEdge = Tables<"workflow_edges">;
/** Full row of `workflow_layouts`. */
export type WorkflowLayout = Tables<"workflow_layouts">;
/** Full row of `workflow_comments`. */
export type WorkflowComment = Tables<"workflow_comments">;
/** Full row of `workflow_collaboration`. */
export type WorkflowCollaboration = Tables<"workflow_collaboration">;
/** Full row of `workflow_debug_sessions`. */
export type WorkflowDebugSession = Tables<"workflow_debug_sessions">;
/** Full row of `template_categories`. */
export type TemplateCategory = Tables<"template_categories">;

/** Insert shape for `workflow_nodes`. */
export type WorkflowNodeInsert = TablesInsert<"workflow_nodes">;
/** Update shape for `workflow_nodes`. */
export type WorkflowNodeUpdate = TablesUpdate<"workflow_nodes">;
/** Insert shape for `workflow_edges`. */
export type WorkflowEdgeInsert = TablesInsert<"workflow_edges">;
/** Update shape for `workflow_edges`. */
export type WorkflowEdgeUpdate = TablesUpdate<"workflow_edges">;
/** Insert shape for `workflow_layouts`. */
export type WorkflowLayoutInsert = TablesInsert<"workflow_layouts">;
/** Update shape for `workflow_layouts`. */
export type WorkflowLayoutUpdate = TablesUpdate<"workflow_layouts">;
/** Insert shape for `workflow_comments`. */
export type WorkflowCommentInsert = TablesInsert<"workflow_comments">;
/** Update shape for `workflow_comments`. */
export type WorkflowCommentUpdate = TablesUpdate<"workflow_comments">;
/** Insert shape for `workflow_collaboration`. */
export type WorkflowCollaborationInsert = TablesInsert<"workflow_collaboration">;
/** Update shape for `workflow_collaboration`. */
export type WorkflowCollaborationUpdate = TablesUpdate<"workflow_collaboration">;
/** Insert shape for `workflow_debug_sessions`. */
export type WorkflowDebugSessionInsert = TablesInsert<"workflow_debug_sessions">;
/** Update shape for `workflow_debug_sessions`. */
export type WorkflowDebugSessionUpdate = TablesUpdate<"workflow_debug_sessions">;

// ---------------------------------------------------------------------------
// Node definition catalog
// ---------------------------------------------------------------------------

/**
 * Catalog definition for a single node type. The `icon` field carries the
 * *name* of a Lucide icon (e.g. `"Webhook"`) — the client looks the icon
 * up via a small local map. Keeping the icon as a string (rather than a
 * `LucideIcon` instance) keeps this module client-safe without pulling
 * the Lucide bundle into every consumer.
 */
export interface NodeDefinition {
  /** Stable, lowercase-kebab identifier (e.g. `"schedule"`, `"send_email"`). */
  type: string;
  /** Human-friendly label (e.g. `"Schedule Trigger"`). */
  label: string;
  /** One-sentence description of what the node does. */
  description: string;
  /** Lucide icon name (resolved client-side). */
  icon: string;
  /** {@link NodeType} — drives the catalog grouping + node color. */
  category: NodeType;
  /** Number of input ports (the left side of the node). */
  inputs: number;
  /** Number of output ports (the right side of the node). */
  outputs: number;
  /**
   * Whether this node can start a workflow (triggers, manual starts).
   * Triggers typically have `inputs = 0` and `isStart = true`.
   */
  isStart: boolean;
  /**
   * Default `config` skeleton the node is created with. Per-instance
   * overrides merge on top of this.
   */
  defaultConfig: Record<string, unknown>;
  /**
   * Schema hint for the config panel. Each field carries a `type`,
   * `label`, optional `placeholder`, optional `options` (for
   * enum/select), and a `required` flag. The UI uses this to render the
   * config form without bundling Zod.
   */
  configSchema: NodeConfigField[];
}

/** A single field in a node definition's config schema. */
export interface NodeConfigField {
  /** Field key in the node's `config` object. */
  key: string;
  /** Human-friendly label. */
  label: string;
  /** Field type — drives the rendered input control. */
  type:
    | "text"
    | "textarea"
    | "number"
    | "boolean"
    | "select"
    | "json"
    | "url"
    | "email";
  /** Optional placeholder shown in the input. */
  placeholder?: string;
  /** Options for `select` fields. */
  options?: { label: string; value: string }[];
  /** Whether the field is required (the validator enforces this). */
  required?: boolean;
  /** Default value when the field is not set on the node config. */
  defaultValue?: unknown;
  /** Optional help text shown below the input. */
  help?: string;
}

// ---------------------------------------------------------------------------
// Service-level DTOs
// ---------------------------------------------------------------------------

/** The full graph of a workflow — used by save / load / export / import. */
export interface WorkflowGraph {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  layout: WorkflowLayout | null;
}

/** Input accepted by `BuilderService.saveWorkflow`. */
export interface SaveWorkflowInput {
  workspaceId: string;
  workflowId: string;
  nodes: WorkflowNodeInput[];
  edges: WorkflowEdgeInput[];
  layout?: WorkflowLayoutInput | null;
}

/** Per-node payload in a save request. */
export interface WorkflowNodeInput {
  /** Stable, per-workflow identifier (e.g. `"trigger_1"`). */
  nodeKey: string;
  /** Catalog node type (e.g. `"schedule"`, `"send_email"`). */
  nodeType: string;
  /** Display category — see {@link NodeType}. */
  category: NodeType;
  label: string;
  position: CanvasPoint;
  config: Record<string, unknown>;
  isEnabled?: boolean;
}

/** Per-edge payload in a save request. */
export interface WorkflowEdgeInput {
  sourceNodeKey: string;
  targetNodeKey: string;
  sourcePort?: string;
  targetPort?: string;
  label?: string;
  condition?: Record<string, unknown>;
}

/** Layout payload in a save request. */
export interface WorkflowLayoutInput {
  viewport: Viewport;
  /** Free-form canvas metadata (snap grid, hidden node ids, etc.). */
  meta?: Record<string, unknown>;
}

/** A single validation issue in a workflow graph. */
export interface ValidationIssue {
  /** `error` blocks saving; `warning` is informational. */
  severity: "error" | "warning";
  /** The node key the issue relates to (or `"_graph"` for graph-wide). */
  nodeKey: string;
  /** Stable, machine-readable issue code (e.g. `"missing_trigger"`). */
  code: string;
  /** Human-readable message safe to surface to clients. */
  message: string;
}

/** Result of `BuilderService.validateWorkflow` / the `/validate` route. */
export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Result of `BuilderService.previewWorkflow` / the `/preview` route. */
export interface PreviewResult {
  ok: boolean;
  /** Ordered list of node keys visited in the preview run. */
  visited: string[];
  /** Per-node runtime variables captured at each step. */
  trace: Array<{
    nodeKey: string;
    startedAt: string;
    finishedAt: string;
    variables: Record<string, unknown>;
    output?: unknown;
    error?: string;
  }>;
  /** Final variables after the run completed. */
  finalVariables: Record<string, unknown>;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
  error?: string;
}

/** A single entry in a debug session's log. */
export interface DebugLogEntry {
  ts: string;
  nodeKey: string;
  event: "enter" | "exit" | "error" | "info";
  message?: string;
  variables?: Record<string, unknown>;
}

/** Input accepted by `BuilderService.createComment`. */
export interface CreateCommentInput {
  workspaceId: string;
  workflowId: string;
  body: string;
  position?: CanvasPoint;
}

/** Input accepted by `BuilderService.updateComment`. */
export interface UpdateCommentInput {
  body?: string;
  position?: CanvasPoint;
  resolved?: boolean;
}

/** Input accepted by `BuilderService.upsertPresence`. */
export interface UpsertPresenceInput {
  workflowId: string;
  cursor?: CanvasPoint;
  selectedNodes?: string[];
}

/** Result of `BuilderService.importWorkflow`. */
export interface ImportResult {
  workflowId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  layout: WorkflowLayout | null;
}

/** Serializable export payload — what `exportWorkflow` returns and
 * `importWorkflow` accepts. */
export interface WorkflowExport {
  version: 1;
  workflowId: string;
  exportedAt: string;
  nodes: Array<{
    nodeKey: string;
    nodeType: string;
    category: NodeType;
    label: string;
    position: CanvasPoint;
    config: Record<string, unknown>;
    isEnabled: boolean;
  }>;
  edges: Array<{
    sourceNodeKey: string;
    targetNodeKey: string;
    sourcePort: string;
    targetPort: string;
    label: string;
    condition: Record<string, unknown>;
  }>;
  layout: {
    viewport: Viewport;
    meta?: Record<string, unknown>;
  } | null;
}

/** JSON value type accepted by Postgres jsonb columns. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[];
