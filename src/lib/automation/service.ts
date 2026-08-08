/**
 * Supa AI — Phase 9A Automation — Service.
 *
 * The single, canonical write-path for the Automation domain. Owns
 * every `workflows`, `workflow_triggers`, `workflow_actions`,
 * `workflow_variables`, `workflow_runs`, `workflow_logs`,
 * `scheduled_jobs`, `automation_templates`, and `webhook_endpoints`
 * table operation: CRUD, lifecycle (pause / resume / archive), trigger
 * + action + variable management, run management (retry / cancel),
 * template listing, and the dashboard aggregate.
 *
 * ## Construction
 *
 * Constructed with the **admin** Supabase client. The 0011 migration's
 * RLS depends on `public.is_workspace_member(workspace_id, auth.uid())`,
 * which in turn depends on the `workspaces` table that lands in Phase
 * 7/9. The admin client bypasses RLS so the service can read/write
 * every row in every workspace. Mutations are still filtered on
 * `workspace_id` at the query layer so the surface is defense-in-depth.
 *
 * ## Workspace resolution
 *
 * The service takes `workspaceId` as an explicit argument on every
 * public method — the API layer resolves it from the request (the
 * caller's session or an explicit `?workspaceId=` query param).
 *
 * @module @/lib/automation/service
 */
import "server-only";

import { randomBytes } from "node:crypto";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/security/crypto";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { WorkflowExecutor } from "./executor";
import { runQueue } from "./queue";
import type {
  ActionHandler,
  AutomationDashboardSummary,
  AutomationTemplate,
  CreateActionInput,
  CreateTemplateInput,
  CreateTriggerInput,
  CreateVariableInput,
  CreateWorkflowInput,
  DispatchEventInput,
  ListRunsOptions,
  ListTemplatesOptions,
  ListWorkflowsOptions,
  ScheduledJob,
  UpdateVariableInput,
  UpdateWorkflowInput,
  WebhookEndpoint,
  Workflow,
  WorkflowAction,
  WorkflowLog,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowTrigger,
  WorkflowVariable,
  WorkflowWithRelations,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_RUNS_LIMIT = 30;
const MAX_RUNS_LIMIT = 100;
const DEFAULT_LOGS_LIMIT = 100;
const MAX_LOGS_LIMIT = 500;
const WEBHOOK_SECRET_BYTES = 24;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Postgres-safe JSON value (mirrors the local type in supabase/types). */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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

function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown as Json;
  return value as Json;
}

/**
 * Generate a random hex secret for a new webhook endpoint. Uses
 * `node:crypto.randomBytes` so the secret is cryptographically strong.
 */
function generateWebhookSecret(): string {
  return randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
}

/**
 * Generate a unique URL slug for a webhook endpoint from a workflow name.
 * Combines a slugified version of the workflow name with 8 hex chars of
 * randomness so two workflows with the same name don't collide.
 */
function generateUrlSlug(workflowName: string): string {
  const base = workflowName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const stub = base.length > 0 ? base : "webhook";
  const suffix = randomBytes(4).toString("hex");
  return `${stub}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only service for the Automation domain. Construct via
 * {@link createAutomationService}; never `new` it directly outside tests.
 */
export class AutomationService {
  constructor(
    private readonly supabase: AnySupabaseClient,
    /** Optional executor — when omitted, the service constructs its own. */
    private readonly executor?: WorkflowExecutor,
  ) {}

  private getExecutor(): WorkflowExecutor {
    return this.executor ?? new WorkflowExecutor(this.supabase);
  }

  // -----------------------------------------------------------------------
  // Workflow CRUD
  // -----------------------------------------------------------------------

  /**
   * List workflows in a workspace. Optionally filter by status, template
   * flag, or template category. Always returns the relations (triggers,
   * actions, variables) so the UI doesn't need a second round-trip per row.
   */
  async listWorkflows(
    wsId: string,
    opts: ListWorkflowsOptions = {},
  ): Promise<WorkflowWithRelations[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("workflows")
        .select()
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.status) query = query.eq("status", opts.status);
      if (typeof opts.isTemplate === "boolean") query = query.eq("is_template", opts.isTemplate);
      if (opts.templateCategory) query = query.eq("template_category", opts.templateCategory);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "automation.listWorkflows failed");
      if (!data || data.length === 0) return [];

      return this.hydrateRelations(data as unknown as Workflow[]);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing workflows.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single workflow by id, with relations. Returns `null` when
   * the row does not exist.
   */
  async getWorkflow(id: string): Promise<WorkflowWithRelations | null> {
    try {
      const { data, error } = await this.supabase
        .from("workflows")
        .select()
        .eq("id", id)
        .maybeSingle();
      if (error) throw toDbError(error, "automation.getWorkflow failed");
      if (!data) return null;
      return this.hydrateSingle(data as unknown as Workflow);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching workflow.", {
        workflowId: id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Create a new workflow. The caller's `userId` is recorded on
   * `created_by`. Returns the created row with empty relations.
   */
  async createWorkflow(
    wsId: string,
    userId: string,
    input: CreateWorkflowInput,
  ): Promise<WorkflowWithRelations> {
    if (!input.name?.trim()) {
      throw new ValidationError("Workflow name is required.");
    }

    try {
      const row = {
        workspace_id: wsId,
        name: input.name.trim(),
        description: input.description ?? null,
        status: input.status ?? "draft",
        version: 1,
        is_template: input.isTemplate ?? false,
        template_category: input.templateCategory ?? null,
        config: toJson(input.config ?? {}),
        created_by: userId,
      };

      const { data, error } = await this.supabase
        .from("workflows")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createWorkflow failed");
      if (!data) {
        throw new DatabaseError("automation.createWorkflow returned no row.");
      }
      return this.emptyRelations(data as unknown as Workflow);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating workflow.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Patch a workflow. Only the supplied fields are written. Throws
   * {@link NotFoundError} when the row does not exist.
   */
  async updateWorkflow(
    id: string,
    input: UpdateWorkflowInput,
  ): Promise<WorkflowWithRelations> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.isTemplate !== undefined) patch.is_template = input.isTemplate;
    if (input.templateCategory !== undefined) patch.template_category = input.templateCategory;
    if (input.config !== undefined) patch.config = toJson(input.config);

    try {
      const { data, error } = await this.supabase
        .from("workflows")
        .update(patch as never)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "automation.updateWorkflow failed");
      if (!data) throw new NotFoundError("Workflow", id);
      return this.hydrateSingle(data as unknown as Workflow);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating workflow.", {
        workflowId: id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Hard-delete a workflow. Cascades to triggers, actions, variables,
   * and logs (via FK on delete cascade).
   */
  async deleteWorkflow(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("workflows")
        .delete()
        .eq("id", id);
      if (error) throw toDbError(error, "automation.deleteWorkflow failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting workflow.", {
        workflowId: id,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle: pause / resume / archive
  // -----------------------------------------------------------------------

  /** Set a workflow's status to `paused`. */
  async pauseWorkflow(id: string): Promise<WorkflowWithRelations> {
    return this.setStatus(id, "paused");
  }

  /** Set a workflow's status to `active`. */
  async resumeWorkflow(id: string): Promise<WorkflowWithRelations> {
    return this.setStatus(id, "active");
  }

  /** Set a workflow's status to `archived`. */
  async archiveWorkflow(id: string): Promise<WorkflowWithRelations> {
    return this.setStatus(id, "archived");
  }

  private async setStatus(
    id: string,
    status: Workflow["status"],
  ): Promise<WorkflowWithRelations> {
    try {
      const { data, error } = await this.supabase
        .from("workflows")
        .update({ status } as never)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "automation.setStatus failed");
      if (!data) throw new NotFoundError("Workflow", id);
      return this.hydrateSingle(data as unknown as Workflow);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating workflow status.", {
        workflowId: id,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Triggers
  // -----------------------------------------------------------------------

  /** List triggers for a workflow. */
  async listTriggers(workflowId: string): Promise<WorkflowTrigger[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_triggers")
        .select()
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });
      if (error) throw toDbError(error, "automation.listTriggers failed");
      return (data ?? []) as unknown as WorkflowTrigger[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing triggers.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /** Create a new trigger for a workflow. */
  async createTrigger(
    workflowId: string,
    input: CreateTriggerInput,
  ): Promise<WorkflowTrigger> {
    if (!input.type) {
      throw new ValidationError("Trigger type is required.");
    }

    try {
      const { data, error } = await this.supabase
        .from("workflow_triggers")
        .insert({
          workflow_id: workflowId,
          type: input.type,
          config: toJson(input.config ?? {}),
          is_active: input.isActive ?? true,
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createTrigger failed");
      return data as unknown as WorkflowTrigger;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating trigger.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  /** List actions for a workflow, ordered by `order`. */
  async listActions(workflowId: string): Promise<WorkflowAction[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_actions")
        .select()
        .eq("workflow_id", workflowId)
        .order("order", { ascending: true });
      if (error) throw toDbError(error, "automation.listActions failed");
      return (data ?? []) as unknown as WorkflowAction[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing actions.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /** Create a new action for a workflow. */
  async createAction(
    workflowId: string,
    input: CreateActionInput,
  ): Promise<WorkflowAction> {
    if (!input.type?.trim()) {
      throw new ValidationError("Action type is required.");
    }
    if (!input.name?.trim()) {
      throw new ValidationError("Action name is required.");
    }

    // When `order` is omitted, append after the last action.
    let order = input.order;
    if (order === undefined) {
      const existing = await this.listActions(workflowId);
      const maxOrder = existing.reduce((acc, a) => Math.max(acc, a.order), -1);
      order = maxOrder + 1;
    }

    try {
      const { data, error } = await this.supabase
        .from("workflow_actions")
        .insert({
          workflow_id: workflowId,
          type: input.type.trim(),
          name: input.name.trim(),
          config: toJson(input.config ?? {}),
          order,
          is_active: input.isActive ?? true,
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createAction failed");
      return data as unknown as WorkflowAction;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating action.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Variables
  // -----------------------------------------------------------------------

  /** List variables for a workflow. */
  async listVariables(workflowId: string): Promise<WorkflowVariable[]> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_variables")
        .select()
        .eq("workflow_id", workflowId)
        .order("key", { ascending: true });
      if (error) throw toDbError(error, "automation.listVariables failed");
      return (data ?? []) as unknown as WorkflowVariable[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing variables.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /** Create a new variable for a workflow. */
  async createVariable(
    workflowId: string,
    input: CreateVariableInput,
  ): Promise<WorkflowVariable> {
    if (!input.key?.trim()) {
      throw new ValidationError("Variable key is required.");
    }

    const isSecret = input.isSecret ?? (input.type === "secret");
    const value = input.value ?? null;
    if (isSecret && value === null) {
      throw new ValidationError("A secret variable requires a value.");
    }

    try {
      const { data, error } = await this.supabase
        .from("workflow_variables")
        .insert({
          workflow_id: workflowId,
          key: input.key.trim(),
          value: isSecret && value !== null ? encrypt(value) : value,
          type: input.type ?? "string",
          is_secret: isSecret,
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createVariable failed");
      return data as unknown as WorkflowVariable;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating variable.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /** Update an existing variable. */
  async updateVariable(
    variableId: string,
    input: UpdateVariableInput,
  ): Promise<WorkflowVariable> {
    try {
      const { data: existing, error: existingError } = await this.supabase
        .from("workflow_variables")
        .select("is_secret, type, value")
        .eq("id", variableId)
        .maybeSingle();
      if (existingError) throw toDbError(existingError, "automation.updateVariable lookup failed");
      if (!existing) throw new NotFoundError("WorkflowVariable", variableId);

      const isSecret = input.isSecret ?? (input.type ? input.type === "secret" : existing.is_secret);
      const patch: Record<string, unknown> = {};
      if (input.value !== undefined) {
        patch.value = isSecret && input.value !== null ? encrypt(input.value) : input.value;
      } else if (isSecret && !existing.is_secret && existing.value !== null) {
        patch.value = encrypt(existing.value);
      }
      if (input.type !== undefined) patch.type = input.type;
      if (input.isSecret !== undefined) patch.is_secret = input.isSecret;

      const { data, error } = await this.supabase
        .from("workflow_variables")
        .update(patch as never)
        .eq("id", variableId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "automation.updateVariable failed");
      if (!data) throw new NotFoundError("WorkflowVariable", variableId);
      return data as unknown as WorkflowVariable;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating variable.", {
        variableId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a variable. */
  async deleteVariable(variableId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("workflow_variables")
        .delete()
        .eq("id", variableId);
      if (error) throw toDbError(error, "automation.deleteVariable failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting variable.", {
        variableId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Runs
  // -----------------------------------------------------------------------

  /** List recent runs (workspace-scoped). */
  async listRuns(
    wsId: string,
    opts: ListRunsOptions = {},
  ): Promise<WorkflowRun[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_RUNS_LIMIT, MAX_RUNS_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("workflow_runs")
        .select()
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.status) query = query.eq("status", opts.status);
      const { data, error } = await query;
      if (error) throw toDbError(error, "automation.listRuns failed");
      return (data ?? []) as unknown as WorkflowRun[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing runs.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * List recent runs for a specific workflow.
   */
  async listRunsForWorkflow(workflowId: string, limit = DEFAULT_RUNS_LIMIT): Promise<WorkflowRun[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_RUNS_LIMIT));
    try {
      const { data, error } = await this.supabase
        .from("workflow_runs")
        .select()
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: false })
        .limit(safeLimit);
      if (error) throw toDbError(error, "automation.listRunsForWorkflow failed");
      return (data ?? []) as unknown as WorkflowRun[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing workflow runs.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /** Fetch a single run by id. */
  async getRun(runId: string): Promise<WorkflowRun | null> {
    try {
      const { data, error } = await this.supabase
        .from("workflow_runs")
        .select()
        .eq("id", runId)
        .maybeSingle();
      if (error) throw toDbError(error, "automation.getRun failed");
      return (data ?? null) as unknown as WorkflowRun | null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching run.", {
        runId,
        cause: appErr.message,
      });
    }
  }

  /** List logs for a run (newest first). */
  async listLogs(runId: string, limit = DEFAULT_LOGS_LIMIT): Promise<WorkflowLog[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_LOGS_LIMIT));
    try {
      const { data, error } = await this.supabase
        .from("workflow_logs")
        .select()
        .eq("run_id", runId)
        .order("created_at", { ascending: true })
        .limit(safeLimit);
      if (error) throw toDbError(error, "automation.listLogs failed");
      return (data ?? []) as unknown as WorkflowLog[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing logs.", {
        runId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Manually trigger a workflow run. Inserts a `pending` run row and
   * enqueues it on the background queue. Returns the new run row.
   *
   * This is the API the `/api/automation/workflows/:id/run` and the
   * `/api/automation/runs/:id/retry` routes call.
   */
  async startRun(
    workflowId: string,
    payload: Record<string, unknown> = {},
  ): Promise<WorkflowRun> {
    try {
      const { data: wfRow, error: wfErr } = await this.supabase
        .from("workflows")
        .select()
        .eq("id", workflowId)
        .maybeSingle();
      if (wfErr) throw toDbError(wfErr, "automation.startRun.loadWorkflow failed");
      const workflow = wfRow as unknown as Workflow | null;
      if (!workflow) throw new NotFoundError("Workflow", workflowId);
      if (workflow.status !== "active" && workflow.status !== "paused") {
        // Allow manual runs even when paused — they're useful for testing.
        // Archived workflows refuse to start.
        throw new ValidationError(
          `Workflow status "${workflow.status}" cannot be started.`,
        );
      }

      const insert = {
        workspace_id: workflow.workspace_id,
        workflow_id: workflow.id,
        trigger_id: null,
        status: "pending" as const,
        metadata: toJson({ payload, manual: true }),
      };
      const { data: runRow, error: runErr } = await this.supabase
        .from("workflow_runs")
        .insert(insert as never)
        .select()
        .single();
      if (runErr) throw toDbError(runErr, "automation.startRun.insert failed");
      const run = runRow as unknown as WorkflowRun;

      // Enqueue for background processing.
      runQueue.enqueue(this.getExecutor(), run.id);
      return run;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure starting run.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Retry a failed or cancelled run. Inserts a new run row with the
   * same workflow + payload, enqueues it, returns the new run row.
   */
  async retryRun(runId: string): Promise<WorkflowRun> {
    try {
      const existing = await this.getRun(runId);
      if (!existing) throw new NotFoundError("WorkflowRun", runId);
      return this.startRun(existing.workflow_id, this.extractPayload(existing));
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure retrying run.", {
        runId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Cancel a pending or running run. Sets the run's status to `cancelled`
   * and removes it from the in-process queue (if still pending).
   */
  async cancelRun(runId: string): Promise<WorkflowRun> {
    try {
      const existing = await this.getRun(runId);
      if (!existing) throw new NotFoundError("WorkflowRun", runId);
      if (existing.status === "completed" || existing.status === "cancelled") {
        return existing;
      }
      runQueue.cancel(runId);
      const { data, error } = await this.supabase
        .from("workflow_runs")
        .update({
          status: "cancelled" as const,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", runId)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.cancelRun failed");
      return data as unknown as WorkflowRun;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure cancelling run.", {
        runId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Convenience wrapper exposed for the trigger dispatcher.
   */
  async dispatchEvent(input: DispatchEventInput): Promise<string[]> {
    // Lazy import to avoid a circular dependency at module load time.
    const { TriggerDispatcher } = await import("./dispatcher");
    const dispatcher = new TriggerDispatcher(this.supabase, this.getExecutor());
    return dispatcher.dispatchEvent(input);
  }

  // -----------------------------------------------------------------------
  // Templates
  // -----------------------------------------------------------------------

  /** List automation templates (optionally filtered by category/featured). */
  async listTemplates(opts: ListTemplatesOptions = {}): Promise<AutomationTemplate[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("automation_templates")
        .select()
        .order("is_featured", { ascending: false })
        .order("install_count", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.category) query = query.eq("category", opts.category);
      if (typeof opts.featured === "boolean") query = query.eq("is_featured", opts.featured);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw toDbError(error, "automation.listTemplates failed");
      return (data ?? []) as unknown as AutomationTemplate[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing templates.", {
        cause: appErr.message,
      });
    }
  }

  /**
   * Publish a new template. The caller's `userId` is recorded on
   * `created_by`.
   */
  async createTemplate(
    userId: string,
    input: CreateTemplateInput,
  ): Promise<AutomationTemplate> {
    if (!input.name?.trim()) {
      throw new ValidationError("Template name is required.");
    }

    try {
      const { data, error } = await this.supabase
        .from("automation_templates")
        .insert({
          name: input.name.trim(),
          description: input.description ?? null,
          category: input.category ?? "general",
          config: toJson(input.config ?? {}),
          is_featured: input.isFeatured ?? false,
          install_count: 0,
          created_by: userId,
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createTemplate failed");
      return data as unknown as AutomationTemplate;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating template.", {
        cause: appErr.message,
      });
    }
  }

  /**
   * Install a template into a workspace: creates a new workflow from
   * the template's `config` and bumps the template's `install_count`.
   */
  async installTemplate(
    templateId: string,
    wsId: string,
    userId: string,
  ): Promise<WorkflowWithRelations> {
    try {
      const { data: tplRow, error: tplErr } = await this.supabase
        .from("automation_templates")
        .select()
        .eq("id", templateId)
        .maybeSingle();
      if (tplErr) throw toDbError(tplErr, "automation.installTemplate.load failed");
      const template = tplRow as unknown as AutomationTemplate | null;
      if (!template) throw new NotFoundError("AutomationTemplate", templateId);

      const cfg = (template.config as Record<string, unknown> | null) ?? {};
      const workflow = await this.createWorkflow(wsId, userId, {
        name: template.name,
        description: template.description,
        status: "draft",
        isTemplate: false,
        config: cfg,
      });

      // Best-effort bump of install_count.
      await this.supabase
        .from("automation_templates")
        .update({ install_count: (template.install_count ?? 0) + 1 } as never)
        .eq("id", templateId);

      return workflow;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure installing template.", {
        templateId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Webhook endpoints
  // -----------------------------------------------------------------------

  /**
   * List webhook endpoints for a workspace.
   */
  async listWebhooks(wsId: string): Promise<WebhookEndpoint[]> {
    try {
      const { data, error } = await this.supabase
        .from("webhook_endpoints")
        .select()
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false });
      if (error) throw toDbError(error, "automation.listWebhooks failed");
      return (data ?? []) as unknown as WebhookEndpoint[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing webhooks.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Create a webhook endpoint for a workflow. Generates a random URL
   * slug + secret.
   */
  async createWebhook(
    workflowId: string,
    wsId: string,
    name?: string,
  ): Promise<WebhookEndpoint> {
    try {
      // Verify the workflow exists in this workspace.
      const { data: wf, error: wfErr } = await this.supabase
        .from("workflows")
        .select()
        .eq("id", workflowId)
        .eq("workspace_id", wsId)
        .maybeSingle();
      if (wfErr) throw toDbError(wfErr, "automation.createWebhook.loadWorkflow failed");
      if (!wf) throw new NotFoundError("Workflow", workflowId);

      const workflow = wf as unknown as Workflow;
      const urlSlug = generateUrlSlug(name ?? workflow.name);
      const secret = generateWebhookSecret();

      const { data, error } = await this.supabase
        .from("webhook_endpoints")
        .insert({
          workspace_id: wsId,
          workflow_id: workflowId,
          url_slug: urlSlug,
          is_active: true,
          secret,
        } as never)
        .select()
        .single();
      if (error) throw toDbError(error, "automation.createWebhook failed");
      return data as unknown as WebhookEndpoint;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating webhook.", {
        workflowId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Dashboard
  // -----------------------------------------------------------------------

  /**
   * Build the dashboard aggregate for a workspace. Used by the
   * automation dashboard UI.
   */
  async getDashboard(wsId: string): Promise<AutomationDashboardSummary> {
    try {
      const [workflowsRes, runsRes, templatesRes, webhooksRes] = await Promise.all([
        this.supabase.from("workflows").select().eq("workspace_id", wsId),
        this.supabase
          .from("workflow_runs")
          .select()
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
          .limit(10),
        this.supabase.from("automation_templates").select("id", { count: "exact", head: true }),
        this.supabase
          .from("webhook_endpoints")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", wsId),
      ]);

      if (workflowsRes.error) throw toDbError(workflowsRes.error, "automation.dashboard.workflows failed");
      if (runsRes.error) throw toDbError(runsRes.error, "automation.dashboard.runs failed");
      if (templatesRes.error) throw toDbError(templatesRes.error, "automation.dashboard.templates failed");
      if (webhooksRes.error) throw toDbError(webhooksRes.error, "automation.dashboard.webhooks failed");

      const workflows = (workflowsRes.data ?? []) as unknown as Workflow[];
      const runs = (runsRes.data ?? []) as unknown as WorkflowRun[];

      const totalWorkflows = workflows.length;
      const activeWorkflows = workflows.filter((w) => w.status === "active").length;
      const pausedWorkflows = workflows.filter((w) => w.status === "paused").length;
      const archivedWorkflows = workflows.filter((w) => w.status === "archived").length;

      // Aggregate run counts from the workflows' metadata (best-effort —
      // the runs table query above only fetches the most recent 10).
      const totalRunsRes = await this.supabase
        .from("workflow_runs")
        .select("id, status, workflow_id", { count: "exact", head: false })
        .eq("workspace_id", wsId)
        .limit(1000);
      if (totalRunsRes.error) throw toDbError(totalRunsRes.error, "automation.dashboard.totalRuns failed");
      const allRuns = (totalRunsRes.data ?? []) as unknown as Array<Pick<WorkflowRun, "id" | "status" | "workflow_id">>;
      const totalRuns = allRuns.length;
      const completedRuns = allRuns.filter((r) => r.status === "completed").length;
      const failedRuns = allRuns.filter((r) => r.status === "failed").length;
      const runningRuns = allRuns.filter((r) => r.status === "running" || r.status === "pending").length;
      const successRate = completedRuns + failedRuns > 0
        ? completedRuns / (completedRuns + failedRuns)
        : 0;

      const perWorkflow = new Map<string, { count: number; completed: number; failed: number }>();
      for (const r of allRuns) {
        const entry = perWorkflow.get(r.workflow_id) ?? { count: 0, completed: 0, failed: 0 };
        entry.count += 1;
        if (r.status === "completed") entry.completed += 1;
        if (r.status === "failed") entry.failed += 1;
        perWorkflow.set(r.workflow_id, entry);
      }
      const topWorkflows = Array.from(perWorkflow.entries())
        .map(([workflowId, e]) => {
          const wf = workflows.find((w) => w.id === workflowId);
          const settled = e.completed + e.failed;
          return {
            workflowId,
            name: wf?.name ?? "(deleted workflow)",
            runCount: e.count,
            successRate: settled > 0 ? e.completed / settled : 0,
          };
        })
        .sort((a, b) => b.runCount - a.runCount)
        .slice(0, 5);

      return {
        totalWorkflows,
        activeWorkflows,
        pausedWorkflows,
        archivedWorkflows,
        totalRuns,
        completedRuns,
        failedRuns,
        runningRuns,
        successRate,
        totalTemplates: templatesRes.count ?? 0,
        totalWebhooks: webhooksRes.count ?? 0,
        recentRuns: runs,
        topWorkflows,
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure building automation dashboard.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Helpers — relation hydration
  // -----------------------------------------------------------------------

  private async hydrateRelations(
    workflows: Workflow[],
  ): Promise<WorkflowWithRelations[]> {
    if (workflows.length === 0) return [];
    const ids = workflows.map((w) => w.id);
    const [triggersRes, actionsRes, varsRes] = await Promise.all([
      this.supabase.from("workflow_triggers").select().in("workflow_id", ids),
      this.supabase.from("workflow_actions").select().in("workflow_id", ids),
      this.supabase.from("workflow_variables").select().in("workflow_id", ids),
    ]);
    if (triggersRes.error) throw toDbError(triggersRes.error, "automation.hydrate.triggers failed");
    if (actionsRes.error) throw toDbError(actionsRes.error, "automation.hydrate.actions failed");
    if (varsRes.error) throw toDbError(varsRes.error, "automation.hydrate.variables failed");

    const triggersByWorkflow = new Map<string, WorkflowTrigger[]>();
    for (const t of (triggersRes.data ?? []) as unknown as WorkflowTrigger[]) {
      const arr = triggersByWorkflow.get(t.workflow_id) ?? [];
      arr.push(t);
      triggersByWorkflow.set(t.workflow_id, arr);
    }
    const actionsByWorkflow = new Map<string, WorkflowAction[]>();
    for (const a of (actionsRes.data ?? []) as unknown as WorkflowAction[]) {
      const arr = actionsByWorkflow.get(a.workflow_id) ?? [];
      arr.push(a);
      actionsByWorkflow.set(a.workflow_id, arr);
    }
    const varsByWorkflow = new Map<string, WorkflowVariable[]>();
    for (const v of (varsRes.data ?? []) as unknown as WorkflowVariable[]) {
      const arr = varsByWorkflow.get(v.workflow_id) ?? [];
      arr.push(v);
      varsByWorkflow.set(v.workflow_id, arr);
    }

    return workflows.map((w) => ({
      ...w,
      triggers: triggersByWorkflow.get(w.id) ?? [],
      actions: (actionsByWorkflow.get(w.id) ?? []).sort((a, b) => a.order - b.order),
      variables: varsByWorkflow.get(w.id) ?? [],
    }));
  }

  private async hydrateSingle(workflow: Workflow): Promise<WorkflowWithRelations> {
    const rows = await this.hydrateRelations([workflow]);
    return rows[0];
  }

  private emptyRelations(workflow: Workflow): WorkflowWithRelations {
    return { ...workflow, triggers: [], actions: [], variables: [] };
  }

  private extractPayload(run: WorkflowRun): Record<string, unknown> {
    const meta = (run.metadata as Record<string, unknown> | null) ?? {};
    const payload = (meta.payload as Record<string, unknown> | null) ?? {};
    return payload;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Construct an {@link AutomationService} with a fresh admin client +
 * executor. Used by the API routes.
 */
export async function createAutomationService(): Promise<AutomationService> {
  // API requests must retain the caller's JWT so RLS enforces workspace
  // membership. Background dispatchers construct their own explicit admin
  // clients and are not routed through this factory.
  return new AutomationService(await createSupabaseServerClient());
}

// ---------------------------------------------------------------------------
// Re-export types the API/UI layers commonly need in one import.
// ---------------------------------------------------------------------------

export type {
  ActionHandler,
  AutomationDashboardSummary,
  AutomationTemplate,
  CreateActionInput,
  CreateTemplateInput,
  CreateTriggerInput,
  CreateVariableInput,
  CreateWorkflowInput,
  ListRunsOptions,
  ListTemplatesOptions,
  ListWorkflowsOptions,
  ScheduledJob,
  UpdateVariableInput,
  UpdateWorkflowInput,
  WebhookEndpoint,
  Workflow,
  WorkflowAction,
  WorkflowLog,
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowTrigger,
  WorkflowVariable,
  WorkflowWithRelations,
} from "./types";
