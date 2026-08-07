/**
 * Supa AI — Phase 12 Supa OS Runtime types (client-safe).
 *
 * @module @/lib/runtime/types
 */
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

// ── Enum unions ────────────────────────────────────────────────────────────

export type RuntimeSessionStatus = "active" | "paused" | "stopped" | "crashed" | "recovering";
export type RuntimeSessionType = "standard" | "orchestrated" | "scheduled" | "recovery";

export type RuntimeProcessType =
  | "agent" | "workflow" | "task" | "supervisor" | "worker" | "scheduler" | "monitor";

export type RuntimeProcessStatus =
  | "pending" | "running" | "paused" | "completed" | "failed" | "cancelled" | "crashed";

export type RuntimeTaskType =
  | "chat" | "image" | "video" | "voice" | "sync" | "webhook"
  | "workflow_action" | "agent_action" | "business" | "custom";

export type RuntimeTaskStatus =
  | "queued" | "running" | "completed" | "failed" | "cancelled" | "timeout" | "retrying";

export type RuntimeEventCategory =
  | "lifecycle" | "task" | "agent" | "workflow" | "resource" | "error" | "recovery" | "communication";

export type RuntimeContextType =
  | "workspace" | "user" | "workflow" | "business" | "agent" | "session" | "runtime";

export type RuntimeResourceType =
  | "cpu" | "memory" | "tokens" | "credits" | "concurrent" | "rate_limit" | "provider_quota";

export type RuntimeScheduleType =
  | "immediate" | "delayed" | "scheduled" | "recurring" | "event_triggered" | "manual";

export type RuntimeRecoveryType = "crash" | "restart" | "checkpoint" | "restore" | "failover";
export type RuntimeRecoveryStatus = "pending" | "in_progress" | "completed" | "failed" | "abandoned";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// ── Row aliases ────────────────────────────────────────────────────────────

export type RuntimeSession = Tables<"runtime_sessions">;
export type RuntimeProcess = Tables<"runtime_processes">;
export type RuntimeTask = Tables<"runtime_tasks">;
export type RuntimeEvent = Tables<"runtime_events">;
export type RuntimeContext = Tables<"runtime_contexts">;
export type RuntimeMetric = Tables<"runtime_metrics">;
export type RuntimeLog = Tables<"runtime_logs">;
export type RuntimeResource = Tables<"runtime_resources">;
export type RuntimeSchedule = Tables<"runtime_schedules">;
export type RuntimeRecovery = Tables<"runtime_recovery">;

// ── Insert/Update aliases ──────────────────────────────────────────────────

export type RuntimeSessionInsert = TablesInsert<"runtime_sessions">;
export type RuntimeSessionUpdate = TablesUpdate<"runtime_sessions">;
export type RuntimeProcessInsert = TablesInsert<"runtime_processes">;
export type RuntimeProcessUpdate = TablesUpdate<"runtime_processes">;
export type RuntimeTaskInsert = TablesInsert<"runtime_tasks">;
export type RuntimeTaskUpdate = TablesUpdate<"runtime_tasks">;
export type RuntimeEventInsert = TablesInsert<"runtime_events">;
export type RuntimeContextInsert = TablesInsert<"runtime_contexts">;
export type RuntimeContextUpdate = TablesUpdate<"runtime_contexts">;
export type RuntimeMetricInsert = TablesInsert<"runtime_metrics">;
export type RuntimeMetricUpdate = TablesUpdate<"runtime_metrics">;
export type RuntimeLogInsert = TablesInsert<"runtime_logs">;
export type RuntimeResourceInsert = TablesInsert<"runtime_resources">;
export type RuntimeResourceUpdate = TablesUpdate<"runtime_resources">;
export type RuntimeScheduleInsert = TablesInsert<"runtime_schedules">;
export type RuntimeScheduleUpdate = TablesUpdate<"runtime_schedules">;
export type RuntimeRecoveryInsert = TablesInsert<"runtime_recovery">;
export type RuntimeRecoveryUpdate = TablesUpdate<"runtime_recovery">;

// ── Service DTOs ───────────────────────────────────────────────────────────

export interface CreateSessionInput {
  workspace_id: string;
  session_type?: RuntimeSessionType;
  config?: Record<string, unknown>;
}

export interface CreateTaskInput {
  workspace_id: string;
  session_id?: string;
  process_id?: string;
  task_type: RuntimeTaskType;
  name: string;
  description?: string;
  priority?: number;
  payload?: Record<string, unknown>;
  timeout_ms?: number;
  max_retries?: number;
  scheduled_for?: string;
  assigned_agent_id?: string;
}

export interface CreateProcessInput {
  workspace_id: string;
  session_id: string;
  process_type: RuntimeProcessType;
  name: string;
  process_ref_id?: string;
  process_ref_type?: string;
  priority?: number;
  parent_process_id?: string;
  assigned_to?: string;
  config?: Record<string, unknown>;
}

export interface CreateScheduleInput {
  workspace_id: string;
  name: string;
  description?: string;
  schedule_type: RuntimeScheduleType;
  cron_expression?: string;
  delay_ms?: number;
  scheduled_for?: string;
  event_trigger?: string;
  target_type: "agent" | "workflow" | "task" | "process";
  target_id: string;
  target_config?: Record<string, unknown>;
  max_runs?: number;
}

export interface RuntimeDashboard {
  active_sessions: number;
  running_processes: number;
  queued_tasks: number;
  running_tasks: number;
  total_tokens_used: number;
  total_credits_used: number;
  failed_tasks_today: number;
  completed_tasks_today: number;
  recent_events: RuntimeEvent[];
}

export interface TaskQueueSummary {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retrying: number;
  by_type: Record<string, number>;
  by_priority: Record<number, number>;
}

export interface ResourceSummary {
  by_type: Record<string, Array<{
    resource_key: string;
    limit_value: number;
    used_value: number;
    reserved_value: number;
    utilization: number;
  }>>;
  total_token_budget: number;
  total_token_used: number;
  total_credit_budget: number;
  total_credit_used: number;
  max_concurrent: number;
  current_concurrent: number;
}

// ── Multi-Agent Orchestration DTOs ────────────────────────────────────────

export interface OrchestrationPlan {
  id: string;
  workspace_id: string;
  supervisor_agent_id: string;
  worker_agent_ids: string[];
  tasks: OrchestrationTask[];
  execution_mode: "parallel" | "sequential" | "dependency_graph";
  shared_context_id?: string;
}

export interface OrchestrationTask {
  id: string;
  name: string;
  assigned_agent_id: string;
  dependencies: string[];
  priority: number;
  status: RuntimeTaskStatus;
  result?: unknown;
}

export interface AgentMessage {
  id: string;
  session_id: string;
  from_agent_id: string;
  to_agent_id: string | null;
  channel: string;
  message_type: "direct" | "broadcast" | "publish" | "request" | "response";
  subject: string;
  body: string;
  context_transfer?: Record<string, unknown>;
  created_at: string;
}

// ── Recovery DTOs ─────────────────────────────────────────────────────────

export interface RecoveryCheckpoint {
  session_id: string;
  workspace_id: string;
  processes: Array<{
    id: string;
    status: string;
    checkpoint_data: Record<string, unknown>;
  }>;
  tasks: Array<{
    id: string;
    status: string;
    payload: Record<string, unknown>;
  }>;
  contexts: Array<{
    id: string;
    data: Record<string, unknown>;
    variables: Record<string, unknown>;
  }>;
  created_at: string;
}
