/**
 * Supa AI — Phase 12 Runtime validation schemas.
 *
 * @module @/lib/validation/runtime
 */
import { z } from "zod";

export const createSessionSchema = z.object({
  workspace_id: z.string().uuid(),
  session_type: z.enum(["standard", "orchestrated", "scheduled", "recovery"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const createTaskSchema = z.object({
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
  task_type: z.enum(["chat", "image", "video", "voice", "sync", "webhook", "workflow_action", "agent_action", "business", "custom"]),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  timeout_ms: z.number().int().min(1000).max(600000).optional(),
  max_retries: z.number().int().min(0).max(10).optional(),
  scheduled_for: z.string().datetime().optional(),
  assigned_agent_id: z.string().uuid().optional(),
});

export const createProcessSchema = z.object({
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  process_type: z.enum(["agent", "workflow", "task", "supervisor", "worker", "scheduler", "monitor"]),
  name: z.string().min(1).max(300),
  process_ref_id: z.string().uuid().optional(),
  process_ref_type: z.string().max(50).optional(),
  priority: z.number().int().min(1).max(10).optional(),
  parent_process_id: z.string().uuid().optional(),
  assigned_to: z.string().max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const createScheduleSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  schedule_type: z.enum(["immediate", "delayed", "scheduled", "recurring", "event_triggered", "manual"]),
  cron_expression: z.string().max(100).optional(),
  delay_ms: z.number().int().min(0).max(86400000).optional(),
  scheduled_for: z.string().datetime().optional(),
  event_trigger: z.string().max(200).optional(),
  target_type: z.enum(["agent", "workflow", "task", "process"]),
  target_id: z.string().uuid(),
  target_config: z.record(z.string(), z.unknown()).optional(),
  max_runs: z.number().int().min(1).max(100000).optional(),
});

export const listSessionsQuerySchema = z.object({
  status: z.enum(["active", "paused", "stopped", "crashed", "recovering"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listTasksQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  status: z.enum(["queued", "running", "completed", "failed", "cancelled", "timeout", "retrying"]).optional(),
  task_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listProcessesQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  status: z.string().optional(),
  process_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listEventsQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  category: z.string().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  event_type: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listLogsQuerySchema = z.object({
  session_id: z.string().uuid().optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]).optional(),
  source: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const orchestrateSchema = z.object({
  workspace_id: z.string().uuid(),
  supervisor_agent_id: z.string().uuid(),
  worker_agent_ids: z.array(z.string().uuid()).min(1),
  tasks: z.array(z.object({
    name: z.string().min(1).max(300),
    assigned_agent_id: z.string().uuid(),
    dependencies: z.array(z.string()).optional(),
    priority: z.number().int().min(1).max(10).optional(),
    task_type: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })).min(1),
  execution_mode: z.enum(["parallel", "sequential", "dependency_graph"]).optional(),
  shared_context: z.record(z.string(), z.unknown()).optional(),
});

export const sendMessageSchema = z.object({
  workspace_id: z.string().uuid(),
  session_id: z.string().uuid(),
  from_agent_id: z.string().uuid(),
  to_agent_id: z.string().uuid().optional(),
  channel: z.string().min(1).max(200),
  message_type: z.enum(["direct", "broadcast", "publish", "request", "response"]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  context_transfer: z.record(z.string(), z.unknown()).optional(),
});
