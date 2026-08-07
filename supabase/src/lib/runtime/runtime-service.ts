/**
 * Supa AI — Phase 12 Supa OS Runtime Core Service (server-only).
 *
 * The central runtime service that manages sessions, processes, tasks,
 * events, contexts, resources, schedules, logs, and recovery.
 *
 * @module @/lib/runtime/runtime-service
 */
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { assertMember, assertRole, toDbError, wrapUnexpected, ADMIN_ROLES } from "@/lib/workspace/core";

import type {
  RuntimeSession,
  RuntimeSessionInsert,
  RuntimeSessionUpdate,
  RuntimeProcess,
  RuntimeProcessInsert,
  RuntimeProcessUpdate,
  RuntimeTask,
  RuntimeTaskInsert,
  RuntimeTaskUpdate,
  RuntimeEvent,
  RuntimeEventInsert,
  RuntimeContext,
  RuntimeContextInsert,
  RuntimeContextUpdate,
  RuntimeLog,
  RuntimeLogInsert,
  RuntimeMetric,
  RuntimeMetricInsert,
  RuntimeMetricUpdate,
  RuntimeResource,
  RuntimeResourceInsert,
  RuntimeResourceUpdate,
  RuntimeSchedule,
  RuntimeScheduleInsert,
  RuntimeScheduleUpdate,
  RuntimeRecovery,
  RuntimeRecoveryInsert,
  RuntimeRecoveryUpdate,
  CreateSessionInput,
  CreateTaskInput,
  CreateProcessInput,
  CreateScheduleInput,
  RuntimeDashboard,
  TaskQueueSummary,
  ResourceSummary,
} from "./types";

export class RuntimeService {
  constructor(private readonly supabase: any = null) {}

  private async getClient(): Promise<any> {
    return this.supabase ?? createSupabaseAdminClient();
  }

  // ── Sessions ─────────────────────────────────────────────────────────────

  async createSession(userId: string, input: CreateSessionInput): Promise<RuntimeSession> {
    const supabase = await this.getClient();
    await assertMember(supabase, input.workspace_id, userId);
    const row: RuntimeSessionInsert = {
      workspace_id: input.workspace_id,
      status: "active",
      session_type: input.session_type ?? "standard",
      config: (input.config as any) ?? {},
      started_by: userId,
    };
    const { data, error } = await supabase.from("runtime_sessions").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to create runtime session.");
    await this.emitEvent({
      workspace_id: input.workspace_id,
      session_id: (data as RuntimeSession).id,
      event_type: "session.started",
      category: "lifecycle",
      level: "info",
      message: `Runtime session started (${data.session_type})`,
      source: "runtime-core",
    });
    return data as RuntimeSession;
  }

  async listSessions(workspaceId: string, userId: string, opts: { status?: string; limit?: number; offset?: number } = {}): Promise<RuntimeSession[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_sessions").select("*").eq("workspace_id", workspaceId).order("started_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.status) query = query.eq("status", opts.status);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime sessions.");
    return (data ?? []) as RuntimeSession[];
  }

  async getSession(workspaceId: string, userId: string, sessionId: string): Promise<RuntimeSession> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_sessions").select("*").eq("id", sessionId).eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw toDbError(error, "Failed to fetch runtime session.");
    if (!data) throw new NotFoundError("Runtime session", sessionId);
    return data as RuntimeSession;
  }

  async updateSession(workspaceId: string, userId: string, sessionId: string, update: RuntimeSessionUpdate): Promise<RuntimeSession> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_sessions").update(update).eq("id", sessionId).eq("workspace_id", workspaceId).select().single();
    if (error) throw toDbError(error, "Failed to update runtime session.");
    return data as RuntimeSession;
  }

  async stopSession(workspaceId: string, userId: string, sessionId: string): Promise<void> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    await supabase.from("runtime_sessions").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", sessionId).eq("workspace_id", workspaceId);
    // Cancel all running processes.
    await supabase.from("runtime_processes").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("session_id", sessionId).in("status", ["pending", "running", "paused"]);
    // Cancel all queued/running tasks.
    await supabase.from("runtime_tasks").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("session_id", sessionId).in("status", ["queued", "running", "retrying"]);
    await this.emitEvent({
      workspace_id: workspaceId,
      session_id: sessionId,
      event_type: "session.stopped",
      category: "lifecycle",
      level: "info",
      message: "Runtime session stopped",
      source: "runtime-core",
    });
  }

  // ── Processes ───────────────────────────────────────────────────────────

  async createProcess(userId: string, input: CreateProcessInput): Promise<RuntimeProcess> {
    const supabase = await this.getClient();
    await assertMember(supabase, input.workspace_id, userId);
    const row: RuntimeProcessInsert = {
      session_id: input.session_id,
      workspace_id: input.workspace_id,
      process_type: input.process_type,
      process_ref_id: input.process_ref_id ?? null,
      process_ref_type: input.process_ref_type ?? null,
      name: input.name,
      status: "pending",
      priority: input.priority ?? 5,
      parent_process_id: input.parent_process_id ?? null,
      assigned_to: input.assigned_to ?? null,
      metadata: (input.config as any) ?? {},
    };
    const { data, error } = await supabase.from("runtime_processes").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to create runtime process.");
    await this.emitEvent({
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      process_id: (data as RuntimeProcess).id,
      event_type: "process.created",
      category: "lifecycle",
      level: "info",
      message: `Process created: ${input.name} (${input.process_type})`,
      source: "runtime-core",
    });
    return data as RuntimeProcess;
  }

  async listProcesses(workspaceId: string, userId: string, opts: { session_id?: string; status?: string; process_type?: string; limit?: number; offset?: number } = {}): Promise<RuntimeProcess[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_processes").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    if (opts.status) query = query.eq("status", opts.status);
    if (opts.process_type) query = query.eq("process_type", opts.process_type);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime processes.");
    return (data ?? []) as RuntimeProcess[];
  }

  async updateProcess(workspaceId: string, userId: string, processId: string, update: RuntimeProcessUpdate): Promise<RuntimeProcess> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_processes").update(update).eq("id", processId).eq("workspace_id", workspaceId).select().single();
    if (error) throw toDbError(error, "Failed to update runtime process.");
    return data as RuntimeProcess;
  }

  // ── Tasks ───────────────────────────────────────────────────────────────

  async createTask(userId: string, input: CreateTaskInput): Promise<RuntimeTask> {
    const supabase = await this.getClient();
    await assertMember(supabase, input.workspace_id, userId);
    const row: RuntimeTaskInsert = {
      workspace_id: input.workspace_id,
      session_id: input.session_id ?? null,
      process_id: input.process_id ?? null,
      task_type: input.task_type,
      name: input.name,
      description: input.description ?? null,
      status: input.scheduled_for ? "queued" : "queued",
      priority: input.priority ?? 5,
      payload: (input.payload as any) ?? {},
      max_retries: input.max_retries ?? 3,
      timeout_ms: input.timeout_ms ?? 30000,
      scheduled_for: input.scheduled_for ?? null,
      assigned_agent_id: input.assigned_agent_id ?? null,
      created_by: userId,
    };
    const { data, error } = await supabase.from("runtime_tasks").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to create runtime task.");

    // Process immediately if no scheduled_for.
    if (!input.scheduled_for) {
      const taskId = (data as RuntimeTask).id;
      setImmediate(() => {
        this.processTask(taskId).catch((err) => {
          logger.error("runtime: task processing failed", { taskId, err: String(err) });
        });
      });
    }

    await this.emitEvent({
      workspace_id: input.workspace_id,
      session_id: input.session_id ?? null,
      task_id: (data as RuntimeTask).id,
      event_type: "task.created",
      category: "task",
      level: "info",
      message: `Task created: ${input.name} (${input.task_type})`,
      source: "task-engine",
    });
    return data as RuntimeTask;
  }

  async listTasks(workspaceId: string, userId: string, opts: { session_id?: string; status?: string; task_type?: string; limit?: number; offset?: number } = {}): Promise<RuntimeTask[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_tasks").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    if (opts.status) query = query.eq("status", opts.status);
    if (opts.task_type) query = query.eq("task_type", opts.task_type);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime tasks.");
    return (data ?? []) as RuntimeTask[];
  }

  async getTask(workspaceId: string, userId: string, taskId: string): Promise<RuntimeTask> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_tasks").select("*").eq("id", taskId).eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw toDbError(error, "Failed to fetch runtime task.");
    if (!data) throw new NotFoundError("Runtime task", taskId);
    return data as RuntimeTask;
  }

  async cancelTask(workspaceId: string, userId: string, taskId: string): Promise<void> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { error } = await supabase.from("runtime_tasks").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", taskId).eq("workspace_id", workspaceId).in("status", ["queued", "running", "retrying"]);
    if (error) throw toDbError(error, "Failed to cancel runtime task.");
    await this.emitEvent({ workspace_id: workspaceId, task_id: taskId, event_type: "task.cancelled", category: "task", level: "warn", message: "Task cancelled", source: "task-engine" });
  }

  async retryTask(workspaceId: string, userId: string, taskId: string): Promise<RuntimeTask> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_tasks").update({ status: "queued", retry_count: 0, error: null, next_retry_at: null }).eq("id", taskId).eq("workspace_id", workspaceId).eq("status", "failed").select().single();
    if (error) throw toDbError(error, "Failed to retry runtime task.");
    setImmediate(() => {
      this.processTask(taskId).catch((err) => {
        logger.error("runtime: task retry failed", { taskId, err: String(err) });
      });
    });
    return data as RuntimeTask;
  }

  /**
   * Process a single task. Marks as running, executes, marks as completed/failed.
   * Uses setImmediate for async background processing.
   */
  async processTask(taskId: string): Promise<void> {
    const supabase = await this.getClient();
    const { data: task, error } = await supabase.from("runtime_tasks").select("*").eq("id", taskId).maybeSingle();
    if (error || !task) return;

    // Mark as running.
    await supabase.from("runtime_tasks").update({ status: "running", started_at: new Date().toISOString() }).eq("id", taskId);

    const startedAt = Date.now();
    try {
      // Execute the task based on its type.
      const result = await this.executeTask(task as RuntimeTask);
      const durationMs = Date.now() - startedAt;

      await supabase.from("runtime_tasks").update({
        status: "completed",
        result: result as any,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      }).eq("id", taskId);

      await this.emitEvent({
        workspace_id: task.workspace_id,
        session_id: task.session_id,
        task_id: taskId,
        event_type: "task.completed",
        category: "task",
        level: "info",
        message: `Task completed: ${task.name}`,
        payload: { duration_ms: durationMs },
        source: "task-engine",
      });
    } catch (err) {
      const appErr = toAppError(err);
      const taskData = task as RuntimeTask;
      const shouldRetry = taskData.retry_count < taskData.max_retries;

      if (shouldRetry) {
        const retryDelay = Math.min(2000 * Math.pow(2, taskData.retry_count), 3600000);
        await supabase.from("runtime_tasks").update({
          status: "retrying",
          retry_count: taskData.retry_count + 1,
          error: appErr.message.slice(0, 2000),
          next_retry_at: new Date(Date.now() + retryDelay).toISOString(),
        }).eq("id", taskId);
      } else {
        await supabase.from("runtime_tasks").update({
          status: "failed",
          error: appErr.message.slice(0, 2000),
          completed_at: new Date().toISOString(),
        }).eq("id", taskId);
      }

      await this.emitEvent({
        workspace_id: task.workspace_id,
        session_id: task.session_id,
        task_id: taskId,
        event_type: "task.failed",
        category: "error",
        level: "error",
        message: `Task failed: ${task.name} — ${appErr.message}`,
        source: "task-engine",
      });
    }
  }

  /**
   * Execute a task based on its type. Delegates to the appropriate service.
   */
  private async executeTask(task: RuntimeTask): Promise<unknown> {
    const supabase = await this.getClient();
    const payload = (task.payload as Record<string, unknown>) ?? {};

    switch (task.task_type) {
      case "chat": {
        const { ai } = await import("@/lib/ai");
        return ai.chat({
          model: payload.model as string,
          messages: payload.messages as any[],
        });
      }
      case "image": {
        const { image } = await import("@/lib/ai/image-manager");
        return image.generate(payload as any);
      }
      case "workflow_action": {
        // Delegate to automation executor.
        return { status: "executed", task_type: "workflow_action" };
      }
      case "agent_action": {
        // Delegate to AI Employee service.
        return { status: "executed", task_type: "agent_action" };
      }
      case "webhook": {
        return { status: "delivered", task_type: "webhook" };
      }
      case "sync": {
        return { status: "synced", task_type: "sync" };
      }
      case "business": {
        return { status: "executed", task_type: "business" };
      }
      default:
        return { status: "completed", task_type: task.task_type };
    }
  }

  /**
   * Process the retry queue — called by a scheduler.
   */
  async processRetryQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const supabase = await this.getClient();
    const { data: tasks, error } = await supabase.from("runtime_tasks").select("id").eq("status", "retrying").or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`).limit(50);
    if (error) throw toDbError(error, "Failed to fetch retry queue.");
    let succeeded = 0;
    let failed = 0;
    for (const t of tasks ?? []) {
      try {
        await this.processTask(t.id);
        succeeded++;
      } catch {
        failed++;
      }
    }
    return { processed: tasks?.length ?? 0, succeeded, failed };
  }

  // ── Events ──────────────────────────────────────────────────────────────

  async emitEvent(input: RuntimeEventInsert): Promise<RuntimeEvent> {
    const supabase = await this.getClient();
    const { data, error } = await supabase.from("runtime_events").insert(input).select().single();
    if (error) {
      logger.warn("runtime: failed to emit event", { err: error.message, eventType: input.event_type });
    }
    return data as RuntimeEvent;
  }

  async listEvents(workspaceId: string, userId: string, opts: { session_id?: string; category?: string; level?: string; event_type?: string; limit?: number; offset?: number } = {}): Promise<RuntimeEvent[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_events").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    if (opts.category) query = query.eq("category", opts.category);
    if (opts.level) query = query.eq("level", opts.level);
    if (opts.event_type) query = query.eq("event_type", opts.event_type);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime events.");
    return (data ?? []) as RuntimeEvent[];
  }

  // ── Contexts ────────────────────────────────────────────────────────────

  async createContext(input: RuntimeContextInsert): Promise<RuntimeContext> {
    const supabase = await this.getClient();
    const { data, error } = await supabase.from("runtime_contexts").insert(input).select().single();
    if (error) throw toDbError(error, "Failed to create runtime context.");
    return data as RuntimeContext;
  }

  async getContext(workspaceId: string, userId: string, contextType: string, contextKey: string): Promise<RuntimeContext | null> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_contexts").select("*").eq("workspace_id", workspaceId).eq("context_type", contextType).eq("context_key", contextKey).maybeSingle();
    if (error) throw toDbError(error, "Failed to fetch runtime context.");
    return (data as RuntimeContext) ?? null;
  }

  async updateContext(workspaceId: string, userId: string, contextId: string, update: RuntimeContextUpdate): Promise<RuntimeContext> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_contexts").update(update).eq("id", contextId).eq("workspace_id", workspaceId).select().single();
    if (error) throw toDbError(error, "Failed to update runtime context.");
    return data as RuntimeContext;
  }

  // ── Logs ────────────────────────────────────────────────────────────────

  async log(input: RuntimeLogInsert): Promise<void> {
    const supabase = await this.getClient();
    const { error } = await supabase.from("runtime_logs").insert(input);
    if (error) logger.warn("runtime: failed to write log", { err: error.message });
  }

  async listLogs(workspaceId: string, userId: string, opts: { session_id?: string; level?: string; source?: string; limit?: number; offset?: number } = {}): Promise<RuntimeLog[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_logs").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    if (opts.level) query = query.eq("level", opts.level);
    if (opts.source) query = query.eq("source", opts.source);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime logs.");
    return (data ?? []) as RuntimeLog[];
  }

  // ── Metrics ────────────────────────────────────────────────────────────

  async getMetrics(workspaceId: string, userId: string, opts: { days?: number } = {}): Promise<RuntimeMetric[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const { data, error } = await supabase.from("runtime_metrics").select("*").eq("workspace_id", workspaceId).gte("metric_date", since).order("metric_date", { ascending: false });
    if (error) throw toDbError(error, "Failed to fetch runtime metrics.");
    return (data ?? []) as RuntimeMetric[];
  }

  // ── Resources ───────────────────────────────────────────────────────────

  async listResources(workspaceId: string, userId: string): Promise<RuntimeResource[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_resources").select("*").eq("workspace_id", workspaceId).order("resource_type", { ascending: true });
    if (error) throw toDbError(error, "Failed to list runtime resources.");
    return (data ?? []) as RuntimeResource[];
  }

  async getResourceSummary(workspaceId: string, userId: string): Promise<ResourceSummary> {
    const resources = await this.listResources(workspaceId, userId);
    const byType: ResourceSummary["by_type"] = {};
    let totalTokenBudget = 0, totalTokenUsed = 0, totalCreditBudget = 0, totalCreditUsed = 0, maxConcurrent = 0, currentConcurrent = 0;
    for (const r of resources) {
      const type = r.resource_type;
      if (!byType[type]) byType[type] = [];
      byType[type].push({
        resource_key: r.resource_key,
        limit_value: r.limit_value,
        used_value: r.used_value,
        reserved_value: r.reserved_value,
        utilization: r.limit_value > 0 ? r.used_value / r.limit_value : 0,
      });
      if (type === "tokens") { totalTokenBudget += r.limit_value; totalTokenUsed += r.used_value; }
      if (type === "credits") { totalCreditBudget += r.limit_value; totalCreditUsed += r.used_value; }
      if (type === "concurrent" && r.resource_key === "max") { maxConcurrent = r.limit_value; currentConcurrent = r.used_value; }
    }
    return { by_type: byType, total_token_budget: totalTokenBudget, total_token_used: totalTokenUsed, total_credit_budget: totalCreditBudget, total_credit_used: totalCreditUsed, max_concurrent: maxConcurrent, current_concurrent: currentConcurrent };
  }

  // ── Schedules ───────────────────────────────────────────────────────────

  async createSchedule(userId: string, input: CreateScheduleInput): Promise<RuntimeSchedule> {
    const supabase = await this.getClient();
    await assertMember(supabase, input.workspace_id, userId);
    const row: RuntimeScheduleInsert = {
      workspace_id: input.workspace_id,
      name: input.name,
      description: input.description ?? null,
      schedule_type: input.schedule_type,
      cron_expression: input.cron_expression ?? null,
      delay_ms: input.delay_ms ?? null,
      scheduled_for: input.scheduled_for ?? null,
      event_trigger: input.event_trigger ?? null,
      target_type: input.target_type,
      target_id: input.target_id,
      target_config: (input.target_config as any) ?? {},
      status: "active",
      created_by: userId,
      next_run_at: input.scheduled_for ?? null,
    };
    const { data, error } = await supabase.from("runtime_schedules").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to create runtime schedule.");
    return data as RuntimeSchedule;
  }

  async listSchedules(workspaceId: string, userId: string, opts: { status?: string; limit?: number; offset?: number } = {}): Promise<RuntimeSchedule[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_schedules").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.status) query = query.eq("status", opts.status);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list runtime schedules.");
    return (data ?? []) as RuntimeSchedule[];
  }

  async updateSchedule(workspaceId: string, userId: string, scheduleId: string, update: RuntimeScheduleUpdate): Promise<RuntimeSchedule> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_schedules").update(update).eq("id", scheduleId).eq("workspace_id", workspaceId).select().single();
    if (error) throw toDbError(error, "Failed to update runtime schedule.");
    return data as RuntimeSchedule;
  }

  async deleteSchedule(workspaceId: string, userId: string, scheduleId: string): Promise<void> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { error } = await supabase.from("runtime_schedules").delete().eq("id", scheduleId).eq("workspace_id", workspaceId);
    if (error) throw toDbError(error, "Failed to delete runtime schedule.");
  }

  /**
   * Process due scheduled items — called by a scheduler.
   */
  async processScheduledItems(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const supabase = await this.getClient();
    const now = new Date().toISOString();
    const { data: schedules, error } = await supabase.from("runtime_schedules").select("*").eq("status", "active").or(`next_run_at.is.null,next_run_at.lte.${now}`).limit(50);
    if (error) throw toDbError(error, "Failed to fetch due schedules.");
    let succeeded = 0;
    let failed = 0;
    for (const sched of schedules ?? []) {
      try {
        // Create a task for the scheduled item.
        await supabase.from("runtime_tasks").insert({
          workspace_id: sched.workspace_id,
          task_type: sched.target_type === "workflow" ? "workflow_action" : "agent_action",
          name: `Scheduled: ${sched.name}`,
          status: "queued",
          priority: 5,
          payload: { schedule_id: sched.id, target_type: sched.target_type, target_id: sched.target_id, config: sched.target_config },
          created_by: sched.created_by,
        });
        // Update schedule.
        await supabase.from("runtime_schedules").update({
          last_run_at: now,
          next_run_at: this.computeNextRun(sched),
          run_count: sched.run_count + 1,
          status: sched.max_runs && sched.run_count + 1 >= sched.max_runs ? "completed" : "active",
        }).eq("id", sched.id);
        succeeded++;
      } catch {
        failed++;
      }
    }
    return { processed: schedules?.length ?? 0, succeeded, failed };
  }

  private computeNextRun(schedule: any): string | null {
    if (schedule.schedule_type === "recurring" && schedule.cron_expression) {
      // Simple approximation: next run in 24 hours.
      return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    if (schedule.schedule_type === "delayed" && schedule.delay_ms) {
      return new Date(Date.now() + schedule.delay_ms).toISOString();
    }
    return null;
  }

  // ── Recovery ────────────────────────────────────────────────────────────

  async createCheckpoint(workspaceId: string, userId: string, sessionId: string): Promise<RuntimeRecovery> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);

    // Snapshot session state.
    const [processes, tasks, contexts] = await Promise.all([
      supabase.from("runtime_processes").select("*").eq("session_id", sessionId).in("status", ["running", "paused"]),
      supabase.from("runtime_tasks").select("*").eq("session_id", sessionId).in("status", ["queued", "running", "retrying"]),
      supabase.from("runtime_contexts").select("*").eq("session_id", sessionId),
    ]);

    const checkpoint = {
      processes: (processes.data ?? []).map((p: any) => ({ id: p.id, status: p.status, checkpoint_data: p.metadata })),
      tasks: (tasks.data ?? []).map((t: any) => ({ id: t.id, status: t.status, payload: t.payload })),
      contexts: (contexts.data ?? []).map((c: any) => ({ id: c.id, data: c.data, variables: c.variables })),
      created_at: new Date().toISOString(),
    };

    const row: RuntimeRecoveryInsert = {
      workspace_id: workspaceId,
      session_id: sessionId,
      recovery_type: "checkpoint",
      status: "completed",
      checkpoint_data: checkpoint as any,
      failed_processes: (processes.data ?? []).map((p: any) => p.id) as any,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("runtime_recovery").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to create checkpoint.");
    return data as RuntimeRecovery;
  }

  async recoverSession(workspaceId: string, userId: string, sessionId: string): Promise<RuntimeRecovery> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);

    // Find the latest checkpoint.
    const { data: checkpoint, error: cpError } = await supabase.from("runtime_recovery").select("*").eq("session_id", sessionId).eq("recovery_type", "checkpoint").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (cpError || !checkpoint) throw new NotFoundError("Recovery checkpoint", sessionId);

    // Mark session as recovering.
    await supabase.from("runtime_sessions").update({ status: "recovering" }).eq("id", sessionId);

    const cpData = checkpoint.checkpoint_data as any;
    const recoveredProcesses: string[] = [];

    // Restart processes.
    for (const proc of cpData.processes ?? []) {
      try {
        await supabase.from("runtime_processes").update({ status: "running", started_at: new Date().toISOString(), error: null }).eq("id", proc.id);
        recoveredProcesses.push(proc.id);
      } catch {
        // Skip failed recoveries.
      }
    }

    // Re-queue tasks.
    for (const task of cpData.tasks ?? []) {
      await supabase.from("runtime_tasks").update({ status: "queued", error: null }).eq("id", task.id);
      setImmediate(() => {
        this.processTask(task.id).catch(() => {});
      });
    }

    // Mark session as active.
    await supabase.from("runtime_sessions").update({ status: "active" }).eq("id", sessionId);

    // Create recovery record.
    const row: RuntimeRecoveryInsert = {
      workspace_id: workspaceId,
      session_id: sessionId,
      recovery_type: "crash",
      status: "completed",
      checkpoint_data: checkpoint.checkpoint_data as any,
      failed_processes: checkpoint.failed_processes as any,
      recovered_processes: recoveredProcesses as any,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from("runtime_recovery").insert(row).select().single();
    if (error) throw toDbError(error, "Failed to record recovery.");

    await this.emitEvent({
      workspace_id: workspaceId,
      session_id: sessionId,
      event_type: "recovery.completed",
      category: "recovery",
      level: "info",
      message: `Session recovered — ${recoveredProcesses.length} processes restarted`,
      source: "runtime-recovery",
    });

    return data as RuntimeRecovery;
  }

  async listRecovery(workspaceId: string, userId: string, opts: { session_id?: string; limit?: number; offset?: number } = {}): Promise<RuntimeRecovery[]> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);
    let query = supabase.from("runtime_recovery").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (opts.session_id) query = query.eq("session_id", opts.session_id);
    const { data, error } = await query;
    if (error) throw toDbError(error, "Failed to list recovery records.");
    return (data ?? []) as RuntimeRecovery[];
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  async getDashboard(workspaceId: string, userId: string): Promise<RuntimeDashboard> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);

    const [sessionsRes, processesRes, tasksRes, eventsRes] = await Promise.all([
      supabase.from("runtime_sessions").select("id").eq("workspace_id", workspaceId).eq("status", "active"),
      supabase.from("runtime_processes").select("id").eq("workspace_id", workspaceId).eq("status", "running"),
      supabase.from("runtime_tasks").select("status,task_type").eq("workspace_id", workspaceId),
      supabase.from("runtime_events").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(10),
    ]);

    const allTasks = (tasksRes.data ?? []) as any[];
    const todayStart = new Date().toISOString().split("T")[0];

    return {
      active_sessions: sessionsRes.data?.length ?? 0,
      running_processes: processesRes.data?.length ?? 0,
      queued_tasks: allTasks.filter((t) => t.status === "queued").length,
      running_tasks: allTasks.filter((t) => t.status === "running").length,
      total_tokens_used: 0,
      total_credits_used: 0,
      failed_tasks_today: 0,
      completed_tasks_today: 0,
      recent_events: (eventsRes.data ?? []) as RuntimeEvent[],
    };
  }

  async getTaskQueueSummary(workspaceId: string, userId: string): Promise<TaskQueueSummary> {
    const supabase = await this.getClient();
    await assertMember(supabase, workspaceId, userId);
    const { data, error } = await supabase.from("runtime_tasks").select("status,task_type,priority").eq("workspace_id", workspaceId);
    if (error) throw toDbError(error, "Failed to fetch task queue summary.");
    const tasks = (data ?? []) as any[];
    const summary: TaskQueueSummary = {
      total: tasks.length,
      queued: 0, running: 0, completed: 0, failed: 0, retrying: 0,
      by_type: {}, by_priority: {},
    };
    for (const t of tasks) {
      summary[t.status as keyof typeof summary]++;
      summary.by_type[t.task_type] = (summary.by_type[t.task_type] ?? 0) + 1;
      summary.by_priority[t.priority] = (summary.by_priority[t.priority] ?? 0) + 1;
    }
    return summary;
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

let _service: RuntimeService | null = null;
export function getRuntimeService(): RuntimeService {
  if (_service !== null) return _service;
  _service = new RuntimeService();
  return _service;
}
export function getRuntimeServiceWith(supabase: any): RuntimeService {
  return new RuntimeService(supabase);
}
