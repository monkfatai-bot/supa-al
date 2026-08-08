/**
 * Supa AI — Phase 9A Automation Engine — types.
 *
 * Domain-level types shared by the automation service layer, API routes,
 * and the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/automation/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types`
 * (`Tables<'...'>`). The types here are the *service* shape — narrower
 * column sets, friendly camelCase field names, and discriminated unions
 * for status enums.
 *
 * @module @/lib/automation/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status enums (mirrors the CHECK constraints in 0011_phase9a_automation.sql)
// ---------------------------------------------------------------------------

/** Lifecycle status of a `workflows` row. */
export type WorkflowStatus = "active" | "paused" | "archived" | "draft";

/** Type of trigger that can start a workflow run. */
export type WorkflowTriggerType =
  | "schedule"
  | "event"
  | "webhook"
  | "manual"
  | "api";

/** Status of a `workflow_runs` row. */
export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Log level emitted during a run. */
export type WorkflowLogLevel = "debug" | "info" | "warn" | "error";

/** Variable value type stored in `workflow_variables.type`. */
export type WorkflowVariableType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "secret";

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `workflows`. */
export type Workflow = Tables<"workflows">;
/** Full row of `workflow_triggers`. */
export type WorkflowTrigger = Tables<"workflow_triggers">;
/** Full row of `workflow_actions`. */
export type WorkflowAction = Tables<"workflow_actions">;
/** Full row of `workflow_runs`. */
export type WorkflowRun = Tables<"workflow_runs">;
/** Full row of `workflow_logs`. */
export type WorkflowLog = Tables<"workflow_logs">;
/** Full row of `workflow_variables`. */
export type WorkflowVariable = Tables<"workflow_variables">;
/** Full row of `scheduled_jobs`. */
export type ScheduledJob = Tables<"scheduled_jobs">;
/** Full row of `automation_templates`. */
export type AutomationTemplate = Tables<"automation_templates">;
/** Full row of `webhook_endpoints`. */
export type WebhookEndpoint = Tables<"webhook_endpoints">;

/** Insert shape for `workflows`. */
export type WorkflowInsert = TablesInsert<"workflows">;
/** Update shape for `workflows`. */
export type WorkflowUpdate = TablesUpdate<"workflows">;
/** Insert shape for `workflow_triggers`. */
export type WorkflowTriggerInsert = TablesInsert<"workflow_triggers">;
/** Update shape for `workflow_triggers`. */
export type WorkflowTriggerUpdate = TablesUpdate<"workflow_triggers">;
/** Insert shape for `workflow_actions`. */
export type WorkflowActionInsert = TablesInsert<"workflow_actions">;
/** Update shape for `workflow_actions`. */
export type WorkflowActionUpdate = TablesUpdate<"workflow_actions">;
/** Insert shape for `workflow_variables`. */
export type WorkflowVariableInsert = TablesInsert<"workflow_variables">;
/** Update shape for `workflow_variables`. */
export type WorkflowVariableUpdate = TablesUpdate<"workflow_variables">;
/** Insert shape for `workflow_runs`. */
export type WorkflowRunInsert = TablesInsert<"workflow_runs">;
/** Update shape for `workflow_runs`. */
export type WorkflowRunUpdate = TablesUpdate<"workflow_runs">;
/** Insert shape for `workflow_logs`. */
export type WorkflowLogInsert = TablesInsert<"workflow_logs">;
/** Insert shape for `automation_templates`. */
export type AutomationTemplateInsert = TablesInsert<"automation_templates">;
/** Insert shape for `scheduled_jobs`. */
export type ScheduledJobInsert = TablesInsert<"scheduled_jobs">;
/** Update shape for `scheduled_jobs`. */
export type ScheduledJobUpdate = TablesUpdate<"scheduled_jobs">;
/** Insert shape for `webhook_endpoints`. */
export type WebhookEndpointInsert = TablesInsert<"webhook_endpoints">;

// ---------------------------------------------------------------------------
// Service-level DTOs (input shapes accepted by the service methods)
// ---------------------------------------------------------------------------

/** Input accepted by `AutomationService.createWorkflow`. */
export interface CreateWorkflowInput {
  name: string;
  description?: string | null;
  status?: WorkflowStatus;
  isTemplate?: boolean;
  templateCategory?: string | null;
  config?: Record<string, unknown>;
}

/** Input accepted by `AutomationService.updateWorkflow`. */
export interface UpdateWorkflowInput {
  name?: string;
  description?: string | null;
  status?: WorkflowStatus;
  isTemplate?: boolean;
  templateCategory?: string | null;
  config?: Record<string, unknown>;
}

/** List options accepted by `AutomationService.listWorkflows`. */
export interface ListWorkflowsOptions {
  search?: string;
  status?: WorkflowStatus;
  isTemplate?: boolean;
  templateCategory?: string;
  limit?: number;
  offset?: number;
}

/** Input accepted by `AutomationService.createTrigger`. */
export interface CreateTriggerInput {
  type: WorkflowTriggerType;
  config?: Record<string, unknown>;
  isActive?: boolean;
}

/** Input accepted by `AutomationService.createAction`. */
export interface CreateActionInput {
  type: string;
  name: string;
  config?: Record<string, unknown>;
  order?: number;
  isActive?: boolean;
}

/** Input accepted by `AutomationService.createVariable`. */
export interface CreateVariableInput {
  key: string;
  value?: string | null;
  type?: WorkflowVariableType;
  isSecret?: boolean;
}

/** Input accepted by `AutomationService.updateVariable`. */
export interface UpdateVariableInput {
  value?: string | null;
  type?: WorkflowVariableType;
  isSecret?: boolean;
}

/** Input accepted by `AutomationService.createTemplate`. */
export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  category?: string;
  config?: Record<string, unknown>;
  isFeatured?: boolean;
}

/** List options accepted by `AutomationService.listTemplates`. */
export interface ListTemplatesOptions {
  category?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

/** List options accepted by `AutomationService.listRuns`. */
export interface ListRunsOptions {
  status?: WorkflowRunStatus;
  limit?: number;
  offset?: number;
}

/** Input accepted by `dispatchEvent` (TriggerDispatcher). */
export interface DispatchEventInput {
  /** The event name (e.g. `contact.created`). */
  event: string;
  /** Optional payload — merged into the run's variable scope. */
  payload?: Record<string, unknown>;
}

/** Input accepted by `dispatchWebhook`. */
export interface DispatchWebhookInput {
  /** The URL slug registered on the `webhook_endpoints` row. */
  urlSlug: string;
  /** Raw body of the inbound webhook request. */
  body: unknown;
  /** Exact HTTP request body used for signature verification. */
  rawBody?: string;
  /** Optional headers from the inbound request (used to verify signatures). */
  headers?: Record<string, string | string[] | undefined>;
}

// ---------------------------------------------------------------------------
// Composite relation shape returned by `AutomationService.getWorkflow`
// ---------------------------------------------------------------------------

/**
 * A workflow with its first-level relations pre-fetched. Always populated
 * — empty arrays when no rows exist, never `null`.
 */
export interface WorkflowWithRelations extends Workflow {
  triggers: WorkflowTrigger[];
  actions: WorkflowAction[];
  variables: WorkflowVariable[];
}

// ---------------------------------------------------------------------------
// Executor + Registry types
// ---------------------------------------------------------------------------

/**
 * Per-run execution context. Carries the variable scope (workflow variables
 * + trigger payload + previous action outputs) and provides helpers the
 * action handlers call (logging, resolving variables, etc.).
 */
export interface WorkflowExecutionContext {
  /** The run row this context belongs to. */
  runId: string;
  /** Workspace id (for RLS-scoped service calls). */
  workspaceId: string;
  /** Workflow id. */
  workflowId: string;
  /** Trigger id (if the run was started by a trigger). */
  triggerId: string | null;
  /** Resolved variable scope — flat key/value map. */
  variables: Record<string, unknown>;
  /** The trigger payload (event/webhook body), if any. */
  payload: Record<string, unknown>;
  /** Accumulated output from previous actions, keyed by action order. */
  outputs: Record<number, unknown>;
  /** ISO timestamp the run started. */
  startedAt: string;
}

/** The contract every action handler implements. */
export interface ActionHandler {
  /** Stable type identifier (e.g. `send_email`, `http_request`). */
  type: string;
  /** Human-friendly label. */
  label: string;
  /**
   * Execute the action. Returns the action's output (merged into the
   * context's `outputs` map under the action's `order`). Throw to mark
   * the action as failed — the executor captures the error and stops.
   */
  execute(
    config: Record<string, unknown>,
    ctx: WorkflowExecutionContext,
  ): Promise<unknown>;
}

/** Result returned by `WorkflowExecutor.executeWorkflow`. */
export interface WorkflowExecutionResult {
  runId: string;
  status: WorkflowRunStatus;
  /** Final accumulated outputs (keyed by action order). */
  outputs: Record<number, unknown>;
  /** Elapsed milliseconds (started_at → completed_at). */
  durationMs: number;
  /** Error message when `status === 'failed'`. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Dashboard summary shape
// ---------------------------------------------------------------------------

/**
 * Aggregate shape returned by `AutomationService.getDashboard`. Used by
 * the automation dashboard UI to render top-level KPIs and recent activity.
 */
export interface AutomationDashboardSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  pausedWorkflows: number;
  archivedWorkflows: number;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  successRate: number;
  totalTemplates: number;
  totalWebhooks: number;
  recentRuns: WorkflowRun[];
  topWorkflows: Array<{
    workflowId: string;
    name: string;
    runCount: number;
    successRate: number;
  }>;
}
