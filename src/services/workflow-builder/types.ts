/**
 * @module workflow-builder/types
 * @description Complete type system for the Visual Workflow Builder.
 *
 * Defines all shared interfaces used by the canvas, node registry,
 * validator, debugger, and execution-preview subsystems of the
 * drag-and-drop workflow editor powered by @xyflow/react v12.
 */

// ─── Re-export DB types ───────────────────────────────────

import type { NodeCategory, Json } from '@/types/generated/database';

// ─── Node System Types ─────────────────────────────────

/**
 * Describes a single handle (connection point) on a workflow node.
 *
 * Each node exposes zero or more source handles (outputs) and target
 * handles (inputs). The `validation` callback is invoked when a
 * connection is attempted so the UI can provide immediate feedback.
 */
export interface NodeHandleConfig {
  /** Unique handle identifier within the node (e.g. 'true', 'false', 'output'). */
  id: string;
  /** Human-readable label shown beside the handle. */
  label: string;
  /** Whether this handle is a source (output) or target (input). */
  type: 'source' | 'target';
  /** Maximum number of connections allowed; `undefined` means unlimited. */
  maxConnections?: number;
  /**
   * Optional runtime validator. Returns `null` when the value is valid,
   * or a descriptive error string otherwise.
   */
  validation?: (value: unknown) => string | null;
}

/**
 * Defines an editable configuration field exposed by a workflow node.
 *
 * The field `type` determines which editor widget is rendered in the
 * node's property panel (e.g. a text input, dropdown, JSON editor, or
 * model selector).
 */
export interface NodeFieldDefinition {
  /** Unique key used to store/retrieve the field value in the node config. */
  key: string;
  /** Human-readable label displayed in the property panel. */
  label: string;
  /**
   * Widget type that controls how the field is rendered.
   *
   * - `model-select` / `provider-select` – API-backed dropdowns.
   * - `variable-picker` – allows referencing output from upstream nodes.
   * - `cron` – specialised cron-expression editor with syntax validation.
   * - `code` – monospace code editor with syntax highlighting.
   * - `json` – JSON editor with schema-aware validation.
   */
  type:
    | 'text'
    | 'textarea'
    | 'number'
    | 'select'
    | 'toggle'
    | 'json'
    | 'code'
    | 'model-select'
    | 'provider-select'
    | 'variable-picker'
    | 'cron';
  /** Placeholder text shown inside empty inputs. */
  placeholder?: string;
  /** Default value applied when the node is first added to the canvas. */
  defaultValue?: unknown;
  /** When `true`, the field must have a non-empty value to pass validation. */
  required?: boolean;
  /** Tooltip or help text shown below the field. */
  description?: string;
  /**
   * Static option list for `select` fields.
   * Ignored for all other field types.
   */
  options?: { label: string; value: string }[];
  /**
   * Optional field-level validator. Returns `null` on success or an
   * error message string on failure.
   */
  validation?: (value: unknown) => string | null;
  /**
   * Optional grouping key. Fields sharing the same `group` are rendered
   * together under a collapsible section in the property panel.
   */
  group?: string;
}

/**
 * Complete definition of a single node type in the workflow builder.
 *
 * Instances of this interface are registered in the {@link NodeRegistry}
 * and used by the canvas to create, render, configure, and validate
 * nodes of the corresponding `type`.
 */
export interface NodeDefinition {
  /**
   * Machine-readable node type identifier.
   * @example 'manual_trigger', 'ai_chat', 'if'
   */
  type: string;
  /** Database-backed category used for grouping in the left panel. */
  category: NodeCategory;
  /** Short human-readable name shown on the node and in the palette. */
  label: string;
  /** Longer description shown in tooltips and documentation. */
  description: string;
  /**
   * Lucide React icon name (camelCase) rendered on the node header.
   * @example 'MousePointerClick', 'MessageSquare', 'GitBranch'
   */
  icon: string;
  /**
   * Tailwind colour token used for the node's accent (border, badge, handle).
   * @example 'emerald', 'violet', 'amber', 'red'
   */
  color: string;
  /** Target (input) handle configurations. */
  inputs: NodeHandleConfig[];
  /** Source (output) handle configurations. */
  outputs: NodeHandleConfig[];
  /** Editable fields exposed in the node's property panel. */
  fields: NodeFieldDefinition[];
  /**
   * Default configuration values merged into the node when it is
   * first placed on the canvas.
   */
  defaultConfig: Record<string, unknown>;
  /**
   * Optional whole-config validator. Runs after individual field
   * validators and can check cross-field dependencies.
   * Returns `null` on success or an error message string.
   */
  validation?: (config: Record<string, unknown>) => string | null;
  /**
   * Estimated credit cost per execution of this node (for preview).
   */
  estimatedCredits?: number;
  /**
   * Estimated wall-clock duration in milliseconds per execution.
   */
  estimatedDurationMs?: number;
}

// ─── Canvas State Types ────────────────────────────────

/**
 * Represents the current viewport position and zoom level of the
 * ReactFlow canvas, suitable for persistence.
 */
export interface CanvasViewport {
  /** Horizontal pan offset in pixels. */
  x: number;
  /** Vertical pan offset in pixels. */
  y: number;
  /** Zoom factor (1 = 100 %). */
  zoom: number;
}

/**
 * Toggles for the various panels and overlays available in the
 * workflow editor UI.
 */
export type PanelState = {
  /** Left sidebar – node palette / category tree. */
  left: boolean;
  /** Right sidebar – node property inspector. */
  right: boolean;
  /** Bottom panel – execution logs, debug timeline. */
  bottom: boolean;
  /** Mini-map overlay in the bottom-right corner. */
  minimap: boolean;
};

// ─── Validation Types ──────────────────────────────────

/**
 * A single validation issue found during workflow validation.
 *
 * Errors prevent the workflow from being saved or executed, while
 * warnings are informational but do not block the operation.
 */
export interface ValidationError {
  /**
   * ID of the node the issue relates to, if applicable.
   * When set the canvas can highlight the offending node.
   */
  nodeId?: string;
  /**
   * ID of the edge the issue relates to, if applicable.
   * When set the canvas can highlight the offending edge.
   */
  edgeId?: string;
  /**
   * Machine-readable classification of the issue.
   *
   * - `missing_node` – an edge references a node ID that does not exist.
   * - `missing_connection` – a non-trigger node has no incoming connection.
   * - `circular_reference` – a cycle was detected in the node graph.
   * - `invalid_variable` – a variable reference could not be resolved.
   * - `unsupported_action` – the action is not available in the current plan.
   * - `invalid_schedule` – the cron expression or schedule is malformed.
   * - `missing_permission` – the user lacks permission for this operation.
   * - `provider_unavailable` – the AI/data provider is not configured.
   * - `missing_config` – a required configuration field is empty.
   * - `invalid_connection` – a connection violates graph rules.
   */
  type:
    | 'missing_node'
    | 'missing_connection'
    | 'circular_reference'
    | 'invalid_variable'
    | 'unsupported_action'
    | 'invalid_schedule'
    | 'missing_permission'
    | 'provider_unavailable'
    | 'missing_config'
    | 'invalid_connection';
  /** Human-readable description of the issue. */
  message: string;
  /** Whether this issue is a hard error or a soft warning. */
  severity: 'error' | 'warning';
}

// ─── Debug Types ───────────────────────────────────────

/**
 * Complete state of the workflow debugger at a point in time.
 *
 * The debugger allows step-through execution of a workflow with
 * breakpoints, variable inspection, and a timeline of completed steps.
 */
export interface DebugState {
  /** Whether a debug session is currently active. */
  isDebugging: boolean;
  /** Index of the node currently being inspected (0-based). */
  currentStepIndex: number;
  /** Whether execution is paused at a breakpoint or manual step. */
  isPaused: boolean;
  /** IDs of nodes that have breakpoints set. */
  breakpointNodeIds: string[];
  /**
   * Snapshot of all workflow variables at the current step.
   * Keys are variable names; values are their resolved values.
   */
  variableSnapshot: Record<string, unknown>;
  /** Ordered list of step executions recorded so far. */
  executionTimeline: DebugTimelineEntry[];
}

/**
 * A single entry in the debug execution timeline.
 *
 * Each entry corresponds to one node having been executed (or attempted).
 */
export interface DebugTimelineEntry {
  /** ID of the node that was executed. */
  nodeId: string;
  /** Display label of the node at time of execution. */
  nodeLabel: string;
  /**
   * Execution status of this step.
   * - `pending`  – not yet reached.
   * - `running`  – currently executing.
   * - `completed` – finished successfully.
   * - `failed`   – threw an error.
   * - `skipped`  – bypassed (e.g. false branch of an If node).
   */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** Unix timestamp (ms) when the step started. */
  startedAt: number;
  /** Unix timestamp (ms) when the step completed (omitted if still running). */
  completedAt?: number;
  /** Output data produced by the node on success. */
  output?: unknown;
  /** Error message if the step failed. */
  error?: string;
  /** Wall-clock duration of the step in milliseconds. */
  durationMs?: number;
}

// ─── Execution Preview Types ────────────────────────────

/**
 * Pre-execution estimate shown to the user before running a workflow.
 *
 * All values are heuristic approximations computed from the node
 * definitions' `estimatedCredits` and `estimatedDurationMs` fields.
 */
export interface ExecutionPreview {
  /** Estimated total execution time in milliseconds. */
  estimatedTimeMs: number;
  /** Estimated total credit cost. */
  estimatedCredits: number;
  /** Number of external API calls the workflow will make. */
  externalApiCalls: number;
  /**
   * Human-readable list of expected output keys/variables.
   * Useful for showing the user what data the workflow produces.
   */
  expectedOutputs: string[];
  /** Warnings about potentially expensive or risky operations. */
  riskWarnings: string[];
  /** Total number of nodes in the workflow graph. */
  nodeCount: number;
  /** Total number of edges (connections) in the workflow graph. */
  edgeCount: number;
}

// ─── Comment Types ──────────────────────────────────────

/**
 * A workflow comment with its author information pre-joined.
 *
 * Comments can be attached to a specific node or placed freely on
 * the canvas. Nested replies are stored in the `replies` array.
 */
export interface WorkflowCommentWithAuthor {
  /** Unique comment identifier. */
  id: string;
  /** Workflow this comment belongs to. */
  workflow_id: string;
  /**
   * Node this comment is attached to, or `null` for a
   * canvas-level comment.
   */
  node_id: string | null;
  /** User who wrote the comment. */
  user_id: string;
  /**
   * Parent comment ID for threaded replies, or `null` for
   * top-level comments.
   */
  parent_id: string | null;
  /** Markdown content of the comment. */
  content: string;
  /** IDs of users @-mentioned in the comment. */
  mentioned_user_ids: string[];
  /** Whether the comment has been marked as resolved. */
  is_resolved: boolean;
  /** X position on the canvas where the comment anchor is placed. */
  position_x: number;
  /** Y position on the canvas where the comment anchor is placed. */
  position_y: number;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** ISO-8601 last-update timestamp. */
  updated_at: string;
  /** Pre-joined author profile information. */
  author?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  /** Nested reply comments. */
  replies?: WorkflowCommentWithAuthor[];
}

// ─── Activity Feed Types ────────────────────────────────

/**
 * A single entry in the workflow collaboration activity feed.
 *
 * Records who did what and when, allowing the team to track changes
 * across the workflow editor.
 */
export interface ActivityFeedEntry {
  /** Unique entry identifier. */
  id: string;
  /** User who performed the action. */
  userId: string;
  /** Display name of the user. */
  userName: string;
  /** Avatar URL or `null` if the user has none. */
  userAvatar: string | null;
  /**
   * Machine-readable action identifier.
   * @example 'node_added', 'edge_deleted', 'workflow_published'
   */
  action: string;
  /** Human-readable description of what happened. */
  details: string;
  /** ISO-8601 timestamp of when the action occurred. */
  timestamp: string;
  /**
   * Optional node ID related to the action (e.g. for node-level
   * changes like reconfiguration or deletion).
   */
  nodeId?: string;
}

// ─── Undo/Redo Types ────────────────────────────────────

/**
 * A single snapshot in the undo/redo history stack.
 *
 * Each entry captures the full node and edge arrays as JSON so
 * the canvas can be restored to any previous state.
 */
export interface HistoryEntry {
  /** Serialized node array at this point in time. */
  nodes: Json;
  /** Serialized edge array at this point in time. */
  edges: Json;
  /** Unix timestamp (ms) when this snapshot was taken. */
  timestamp: number;
  /** Short description of the action that created this entry. */
  description: string;
}

// ─── Keyboard Shortcut Types ────────────────────────────

/**
 * Maps semantic actions to their keyboard shortcut strings.
 *
 * Shortcut strings use lowercase modifiers and keys, joined with `+`.
 * The format is parsed by the editor's hotkey manager to register
 * browser `keydown` listeners.
 *
 * @example 'ctrl+z', 'ctrl+shift+z', 'delete'
 */
export interface KeyboardShortcuts {
  undo: string;
  redo: string;
  delete: string;
  copy: string;
  paste: string;
  duplicate: string;
  selectAll: string;
  save: string;
  zoomIn: string;
  zoomOut: string;
  fitView: string;
  toggleDebug: string;
}

/**
 * Default keyboard shortcut bindings shipped with the workflow editor.
 *
 * Users can override these via the settings panel; overrides are
 * persisted per-workspace in the database.
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcuts = {
  undo: 'ctrl+z',
  redo: 'ctrl+shift+z',
  delete: 'delete',
  copy: 'ctrl+c',
  paste: 'ctrl+v',
  duplicate: 'ctrl+d',
  selectAll: 'ctrl+a',
  save: 'ctrl+s',
  zoomIn: 'ctrl+=',
  zoomOut: 'ctrl+-',
  fitView: 'ctrl+0',
  toggleDebug: 'ctrl+shift+d',
};
