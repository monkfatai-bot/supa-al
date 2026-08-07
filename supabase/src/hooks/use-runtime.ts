"use client";

/**
 * Supa AI — Phase 12 Runtime data hooks.
 *
 * TanStack Query wrappers for every `/api/v1/runtime/*` REST endpoint the
 * Runtime UI consumes. Each hook returns the standard TanStack Query result;
 * mutations invalidate the relevant query keys so the UI stays in sync
 * after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the Supabase
 * auth cookie travels with every call. Errors are normalized into a
 * `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state.
 *
 * @module @/hooks/use-runtime
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  AgentMessage,
  CreateProcessInput,
  CreateScheduleInput,
  CreateSessionInput,
  CreateTaskInput,
  OrchestrationPlan,
  RecoveryCheckpoint,
  ResourceSummary,
  RuntimeDashboard,
  RuntimeEvent,
  RuntimeEventCategory,
  RuntimeLog,
  RuntimeMetric,
  RuntimeProcess,
  RuntimeProcessStatus,
  RuntimeProcessType,
  RuntimeRecovery,
  RuntimeResource,
  RuntimeSchedule,
  RuntimeSession,
  RuntimeTask,
  RuntimeTaskStatus,
  RuntimeTaskType,
  TaskQueueSummary,
} from "@/lib/runtime/types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const runtimeKeys = {
  all: ["runtime"] as const,
  dashboard: (wsId: string | null) =>
    ["runtime", "dashboard", wsId ?? null] as const,
  sessions: (wsId: string | null, opts?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "runtime",
      "sessions",
      wsId ?? null,
      opts?.status ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  processes: (wsId: string | null, opts?: {
    session_id?: string;
    status?: string;
    process_type?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "runtime",
      "processes",
      wsId ?? null,
      opts?.session_id ?? "",
      opts?.status ?? "",
      opts?.process_type ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  tasks: (wsId: string | null, opts?: {
    status?: string;
    task_type?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "runtime",
      "tasks",
      wsId ?? null,
      opts?.status ?? "",
      opts?.task_type ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  events: (wsId: string | null, opts?: {
    category?: string;
    level?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "runtime",
      "events",
      wsId ?? null,
      opts?.category ?? "",
      opts?.level ?? "",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  logs: (wsId: string | null, opts?: {
    level?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }) =>
    [
      "runtime",
      "logs",
      wsId ?? null,
      opts?.level ?? "",
      opts?.source ?? "",
      opts?.limit ?? 100,
      opts?.offset ?? 0,
    ] as const,
  metrics: (wsId: string | null, opts?: { days?: number }) =>
    [
      "runtime",
      "metrics",
      wsId ?? null,
      opts?.days ?? 30,
    ] as const,
  resources: (wsId: string | null) =>
    ["runtime", "resources", wsId ?? null] as const,
  resourceSummary: (wsId: string | null) =>
    ["runtime", "resources", "summary", wsId ?? null] as const,
  schedules: (wsId: string | null) =>
    ["runtime", "schedules", wsId ?? null] as const,
  recovery: (wsId: string | null) =>
    ["runtime", "recovery", wsId ?? null] as const,
  queue: (wsId: string | null) =>
    ["runtime", "queue", wsId ?? null] as const,
  messages: (wsId: string | null, opts?: {
    session_id?: string;
    limit?: number;
  }) =>
    [
      "runtime",
      "messages",
      wsId ?? null,
      opts?.session_id ?? "",
      opts?.limit ?? 50,
    ] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface RuntimeApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<RuntimeApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return {
      message: `Request failed (${res.status}).`,
      status: res.status,
    };
  }
  const envelope = raw as ApiResponse<never>;
  if (envelope && envelope.success === false && envelope.error) {
    return {
      message: envelope.error.message,
      code: envelope.error.code,
      status: res.status,
    };
  }
  return { message: `Request failed (${res.status}).`, status: res.status };
}

/**
 * Issue a JSON request and either return the typed `data` payload or
 * throw a normalized {@link RuntimeApiError}.
 */
async function apiRequest<T>(
  method: string,
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers:
      body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  };
  const res = await fetch(url, init);
  if (!res.ok) {
    throw await unwrapError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as RuntimeApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/sessions?workspaceId=...` — list runtime sessions. */
export function useRuntimeSessions(
  wsId: string | null,
  opts: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.sessions(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ sessions: RuntimeSession[] }>(
        "GET",
        `/api/v1/runtime/sessions${qs ? `?${qs}` : ""}`,
      ).then((r) => r.sessions);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/v1/runtime/sessions` — create a runtime session. */
export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      apiRequest<{ session: RuntimeSession }>(
        "POST",
        "/api/v1/runtime/sessions",
        input,
      ).then((r) => r.session),
    onSuccess: (session) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.sessions(session.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(session.workspace_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/dashboard?workspaceId=...` — aggregate runtime snapshot. */
export function useRuntimeDashboard(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.dashboard(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<RuntimeDashboard>(
        "GET",
        `/api/v1/runtime/dashboard${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: !!wsId,
    staleTime: 10 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Queue summary
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/queue?workspaceId=...` — task queue summary. */
export function useRuntimeQueue(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.queue(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<TaskQueueSummary>(
        "GET",
        `/api/v1/runtime/queue${qs ? `?${qs}` : ""}`,
      );
    },
    enabled: !!wsId,
    staleTime: 5 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/processes?workspaceId=...` — list runtime processes. */
export function useRuntimeProcesses(
  wsId: string | null,
  opts: {
    session_id?: string;
    status?: RuntimeProcessStatus | string;
    process_type?: RuntimeProcessType | string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.processes(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.session_id) p.set("session_id", opts.session_id);
      if (opts.status) p.set("status", opts.status);
      if (opts.process_type) p.set("process_type", opts.process_type);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ processes: RuntimeProcess[] }>(
        "GET",
        `/api/v1/runtime/processes${qs ? `?${qs}` : ""}`,
      ).then((r) => r.processes);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/v1/runtime/processes` — create a runtime process. */
export function useCreateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProcessInput) =>
      apiRequest<{ process: RuntimeProcess }>(
        "POST",
        "/api/v1/runtime/processes",
        input,
      ).then((r) => r.process),
    onSuccess: (process) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.processes(process.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(process.workspace_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/tasks?workspaceId=...` — list runtime tasks. */
export function useRuntimeTasks(
  wsId: string | null,
  opts: {
    status?: RuntimeTaskStatus | string;
    task_type?: RuntimeTaskType | string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.tasks(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.status) p.set("status", opts.status);
      if (opts.task_type) p.set("task_type", opts.task_type);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ tasks: RuntimeTask[] }>(
        "GET",
        `/api/v1/runtime/tasks${qs ? `?${qs}` : ""}`,
      ).then((r) => r.tasks);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** POST `/api/v1/runtime/tasks` — create a runtime task. */
export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) =>
      apiRequest<{ task: RuntimeTask }>(
        "POST",
        "/api/v1/runtime/tasks",
        input,
      ).then((r) => r.task),
    onSuccess: (task) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.tasks(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.queue(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(task.workspace_id),
      });
    },
  });
}

/** POST `/api/v1/runtime/tasks/:id` with `{ action: "cancel" }`. */
export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      apiRequest<{ task: RuntimeTask }>(
        "POST",
        `/api/v1/runtime/tasks/${id}`,
        { action: "cancel" },
      ).then((r) => r.task),
    onSuccess: (task) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.tasks(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.queue(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(task.workspace_id),
      });
    },
  });
}

/** POST `/api/v1/runtime/tasks/:id` with `{ action: "retry" }`. */
export function useRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      apiRequest<{ task: RuntimeTask }>(
        "POST",
        `/api/v1/runtime/tasks/${id}`,
        { action: "retry" },
      ).then((r) => r.task),
    onSuccess: (task) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.tasks(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.queue(task.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(task.workspace_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/events?workspaceId=...` — list runtime events. */
export function useRuntimeEvents(
  wsId: string | null,
  opts: {
    category?: RuntimeEventCategory | string;
    level?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.events(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.category) p.set("category", opts.category);
      if (opts.level) p.set("level", opts.level);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ events: RuntimeEvent[] }>(
        "GET",
        `/api/v1/runtime/events${qs ? `?${qs}` : ""}`,
      ).then((r) => r.events);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/logs?workspaceId=...` — list runtime logs. */
export function useRuntimeLogs(
  wsId: string | null,
  opts: {
    level?: string;
    source?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.logs(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.level) p.set("level", opts.level);
      if (opts.source) p.set("source", opts.source);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ logs: RuntimeLog[] }>(
        "GET",
        `/api/v1/runtime/logs${qs ? `?${qs}` : ""}`,
      ).then((r) => r.logs);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/metrics?workspaceId=...&days=30` — daily aggregates. */
export function useRuntimeMetrics(
  wsId: string | null,
  opts: { days?: number } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.metrics(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      p.set("days", String(opts.days ?? 30));
      const qs = p.toString();
      return apiRequest<{ metrics: RuntimeMetric[] }>(
        "GET",
        `/api/v1/runtime/metrics${qs ? `?${qs}` : ""}`,
      ).then((r) => r.metrics);
    },
    enabled: !!wsId,
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/resources?workspaceId=...` — list resources. */
export function useRuntimeResources(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.resources(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<{ resources: RuntimeResource[] }>(
        "GET",
        `/api/v1/runtime/resources${qs ? `?${qs}` : ""}`,
      ).then((r) => r.resources);
    },
    enabled: !!wsId,
    staleTime: 15 * 1000,
  });
}

/** GET `/api/v1/runtime/resources/summary?workspaceId=...` — ResourceSummary. */
export function useRuntimeResourceSummary(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.resourceSummary(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<{ summary: ResourceSummary }>(
        "GET",
        `/api/v1/runtime/resources/summary${qs ? `?${qs}` : ""}`,
      ).then((r) => r.summary);
    },
    enabled: !!wsId,
    staleTime: 15 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/schedules?workspaceId=...` — list schedules. */
export function useRuntimeSchedules(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.schedules(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<{ schedules: RuntimeSchedule[] }>(
        "GET",
        `/api/v1/runtime/schedules${qs ? `?${qs}` : ""}`,
      ).then((r) => r.schedules);
    },
    enabled: !!wsId,
    staleTime: 15 * 1000,
  });
}

/** POST `/api/v1/runtime/schedules` — create a schedule. */
export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleInput) =>
      apiRequest<{ schedule: RuntimeSchedule }>(
        "POST",
        "/api/v1/runtime/schedules",
        input,
      ).then((r) => r.schedule),
    onSuccess: (schedule) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.schedules(schedule.workspace_id),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(schedule.workspace_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/recovery?workspaceId=...` — list recovery records. */
export function useRuntimeRecovery(wsId: string | null) {
  return useQuery({
    queryKey: runtimeKeys.recovery(wsId),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      const qs = p.toString();
      return apiRequest<{ recoveries: RuntimeRecovery[] }>(
        "GET",
        `/api/v1/runtime/recovery${qs ? `?${qs}` : ""}`,
      ).then((r) => r.recoveries);
    },
    enabled: !!wsId,
    staleTime: 15 * 1000,
  });
}

/**
 * POST `/api/v1/runtime/recovery` — create a checkpoint or trigger
 * recovery. Pass `recovery_type: "checkpoint"` to capture state or
 * `"restore"` to restore from a previous checkpoint.
 */
export function useCreateRecovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workspaceId: string;
      sessionId?: string;
      recoveryType: "checkpoint" | "restore" | "restart" | "failover";
      checkpointData?: Record<string, unknown>;
    }) =>
      apiRequest<{ recovery: RuntimeRecovery; checkpoint?: RecoveryCheckpoint }>(
        "POST",
        "/api/v1/runtime/recovery",
        {
          workspace_id: input.workspaceId,
          session_id: input.sessionId ?? null,
          recovery_type: input.recoveryType,
          checkpoint_data: input.checkpointData ?? {},
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.recovery(vars.workspaceId),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(vars.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** POST `/api/v1/runtime/orchestrate` — multi-agent orchestration. */
export function useOrchestrate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      workspaceId: string;
      supervisorAgentId: string;
      workerAgentIds: string[];
      tasks: Array<{
        name: string;
        assigned_agent_id: string;
        dependencies?: string[];
        priority?: number;
        task_type?: string;
        payload?: Record<string, unknown>;
      }>;
      executionMode?: "parallel" | "sequential" | "dependency_graph";
      sharedContext?: Record<string, unknown>;
    }) =>
      apiRequest<{ plan: OrchestrationPlan; session_id: string }>(
        "POST",
        "/api/v1/runtime/orchestrate",
        {
          workspace_id: input.workspaceId,
          supervisor_agent_id: input.supervisorAgentId,
          worker_agent_ids: input.workerAgentIds,
          tasks: input.tasks,
          execution_mode: input.executionMode ?? "dependency_graph",
          shared_context: input.sharedContext,
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: runtimeKeys.sessions(vars.workspaceId),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.dashboard(vars.workspaceId),
      });
      qc.invalidateQueries({
        queryKey: runtimeKeys.tasks(vars.workspaceId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Messages (agent communication bus)
// ---------------------------------------------------------------------------

/** GET `/api/v1/runtime/messages?workspaceId=...` — list agent messages. */
export function useRuntimeMessages(
  wsId: string | null,
  opts: { session_id?: string; limit?: number } = {},
) {
  return useQuery({
    queryKey: runtimeKeys.messages(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.session_id) p.set("session_id", opts.session_id);
      if (opts.limit) p.set("limit", String(opts.limit));
      const qs = p.toString();
      return apiRequest<{ messages: AgentMessage[] }>(
        "GET",
        `/api/v1/runtime/messages${qs ? `?${qs}` : ""}`,
      ).then((r) => r.messages);
    },
    enabled: !!wsId,
    staleTime: 5 * 1000,
  });
}
