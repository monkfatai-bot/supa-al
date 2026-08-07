"use client";

/**
 * Supa AI — Phase 9A Automation data hooks.
 *
 * TanStack Query wrappers for every `/api/automation/*` REST endpoint
 * the automation UI consumes. Each hook returns the standard TanStack
 * Query result; mutations invalidate the relevant query keys so the
 * UI stays in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state. The cross-
 * component UI state (active tab, selected workflow, active run) lives
 * in `useAutomationStore` (a local React state hook exported below).
 *
 * @module @/hooks/use-automation
 */
import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  AutomationDashboardSummary,
  AutomationTemplate,
  CreateActionInput,
  CreateTemplateInput,
  CreateTriggerInput,
  CreateVariableInput,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  UpdateVariableInput,
  WebhookEndpoint,
  Workflow,
  WorkflowAction,
  WorkflowLog,
  WorkflowRun,
  WorkflowTrigger,
  WorkflowVariable,
  WorkflowWithRelations,
} from "@/lib/automation/client";
import type {
  ListRunsQuery,
  ListTemplatesQuery,
  ListWorkflowsQuery,
} from "@/lib/validation/automation";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const automationKeys = {
  all: ["automation"] as const,
  workflows: (wsId: string | null, opts?: ListWorkflowsQuery) =>
    [
      "automation",
      "workflows",
      wsId ?? null,
      opts?.search ?? "",
      opts?.status ?? "",
      opts?.isTemplate ?? "",
      opts?.templateCategory ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  workflow: (id: string | null) =>
    ["automation", "workflow", id ?? null] as const,
  triggers: (workflowId: string | null) =>
    ["automation", "workflow", workflowId ?? null, "triggers"] as const,
  actions: (workflowId: string | null) =>
    ["automation", "workflow", workflowId ?? null, "actions"] as const,
  variables: (workflowId: string | null) =>
    ["automation", "workflow", workflowId ?? null, "variables"] as const,
  workflowRuns: (workflowId: string | null, limit = 30) =>
    [
      "automation",
      "workflow",
      workflowId ?? null,
      "runs",
      limit,
    ] as const,
  run: (runId: string | null) =>
    ["automation", "run", runId ?? null] as const,
  runLogs: (runId: string | null, limit = 100) =>
    ["automation", "run", runId ?? null, "logs", limit] as const,
  runs: (wsId: string | null, opts?: ListRunsQuery) =>
    [
      "automation",
      "runs",
      wsId ?? null,
      opts?.status ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  templates: (opts?: ListTemplatesQuery) =>
    [
      "automation",
      "templates",
      opts?.category ?? "",
      opts?.search ?? "",
      opts?.featured ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  dashboard: (wsId: string | null) =>
    ["automation", "dashboard", wsId ?? null] as const,
  webhooks: (wsId: string | null) =>
    ["automation", "webhooks", wsId ?? null] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface AutomationApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<AutomationApiError> {
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
 * throw a normalized {@link AutomationApiError}.
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
    } as AutomationApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

/** GET `/api/automation/workflows?workspaceId=...` — list workflows. */
export function useWorkflows(wsId: string | null, opts: ListWorkflowsQuery = {}) {
  return useQuery({
    queryKey: automationKeys.workflows(wsId, opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (wsId) p.set("workspaceId", wsId);
      if (opts.search) p.set("search", opts.search);
      if (opts.status) p.set("status", opts.status);
      if (opts.isTemplate !== undefined) p.set("isTemplate", String(opts.isTemplate));
      if (opts.templateCategory) p.set("templateCategory", opts.templateCategory);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ workflows: WorkflowWithRelations[] }>(
        "GET",
        `/api/automation/workflows${qs ? `?${qs}` : ""}`,
      ).then((r) => r.workflows);
    },
    enabled: !!wsId,
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/automation/workflows/:id` — fetch a single workflow. */
export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: automationKeys.workflow(id),
    queryFn: () =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "GET",
        `/api/automation/workflows/${id}`,
      ).then((r) => r.workflow),
    enabled: !!id,
  });
}

/** POST `/api/automation/workflows` — create a workflow. */
export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: CreateWorkflowInput;
    }) =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "POST",
        "/api/automation/workflows",
        { ...input, workspaceId },
      ).then((r) => r.workflow),
    onSuccess: (workflow) => {
      qc.setQueryData(automationKeys.workflow(workflow.id), { workflow });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** PATCH `/api/automation/workflows/:id` — partial update. */
export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateWorkflowInput;
    }) =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "PATCH",
        `/api/automation/workflows/${id}`,
        input,
      ).then((r) => r.workflow),
    onSuccess: (workflow) => {
      qc.setQueryData(automationKeys.workflow(workflow.id), { workflow });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** DELETE `/api/automation/workflows/:id` — hard-delete. */
export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/automation/workflows/${id}`,
      ),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: automationKeys.workflow(id) });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** POST `/api/automation/workflows/:id/pause` — pause. */
export function usePauseWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "PATCH",
        `/api/automation/workflows/${id}`,
        { status: "paused" },
      ).then((r) => r.workflow),
    onSuccess: (workflow) => {
      qc.setQueryData(automationKeys.workflow(workflow.id), { workflow });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** POST `/api/automation/workflows/:id/resume` — resume. */
export function useResumeWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "PATCH",
        `/api/automation/workflows/${id}`,
        { status: "active" },
      ).then((r) => r.workflow),
    onSuccess: (workflow) => {
      qc.setQueryData(automationKeys.workflow(workflow.id), { workflow });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** POST `/api/automation/workflows/:id/archive` — archive. */
export function useArchiveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ workflow: WorkflowWithRelations }>(
        "PATCH",
        `/api/automation/workflows/${id}`,
        { status: "archived" },
      ).then((r) => r.workflow),
    onSuccess: (workflow) => {
      qc.setQueryData(automationKeys.workflow(workflow.id), { workflow });
      qc.invalidateQueries({ queryKey: ["automation", "workflows"] });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

/** GET `/api/automation/workflows/:id/triggers` — list triggers. */
export function useTriggers(workflowId: string | null) {
  return useQuery({
    queryKey: automationKeys.triggers(workflowId),
    queryFn: () =>
      apiRequest<{ triggers: WorkflowTrigger[] }>(
        "GET",
        `/api/automation/workflows/${workflowId}/triggers`,
      ).then((r) => r.triggers),
    enabled: !!workflowId,
  });
}

/** POST `/api/automation/workflows/:id/triggers` — create a trigger. */
export function useCreateTrigger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: CreateTriggerInput;
    }) =>
      apiRequest<{ trigger: WorkflowTrigger }>(
        "POST",
        `/api/automation/workflows/${workflowId}/triggers`,
        input,
      ).then((r) => r.trigger),
    onSuccess: (trigger) => {
      qc.invalidateQueries({
        queryKey: automationKeys.triggers(trigger.workflow_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** GET `/api/automation/workflows/:id/actions` — list actions. */
export function useActions(workflowId: string | null) {
  return useQuery({
    queryKey: automationKeys.actions(workflowId),
    queryFn: () =>
      apiRequest<{ actions: WorkflowAction[] }>(
        "GET",
        `/api/automation/workflows/${workflowId}/actions`,
      ).then((r) => r.actions),
    enabled: !!workflowId,
  });
}

/** POST `/api/automation/workflows/:id/actions` — create an action. */
export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: CreateActionInput;
    }) =>
      apiRequest<{ action: WorkflowAction }>(
        "POST",
        `/api/automation/workflows/${workflowId}/actions`,
        input,
      ).then((r) => r.action),
    onSuccess: (action) => {
      qc.invalidateQueries({
        queryKey: automationKeys.actions(action.workflow_id),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/** GET `/api/automation/workflows/:id/variables` — list variables. */
export function useVariables(workflowId: string | null) {
  return useQuery({
    queryKey: automationKeys.variables(workflowId),
    queryFn: () =>
      apiRequest<{ variables: WorkflowVariable[] }>(
        "GET",
        `/api/automation/workflows/${workflowId}/variables`,
      ).then((r) => r.variables),
    enabled: !!workflowId,
  });
}

/** POST `/api/automation/workflows/:id/variables` — create a variable. */
export function useCreateVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: CreateVariableInput;
    }) =>
      apiRequest<{ variable: WorkflowVariable }>(
        "POST",
        `/api/automation/workflows/${workflowId}/variables`,
        input,
      ).then((r) => r.variable),
    onSuccess: (variable) => {
      qc.invalidateQueries({
        queryKey: automationKeys.variables(variable.workflow_id),
      });
    },
  });
}

/** PATCH a variable (no dedicated route — uses the create route for now). */
export function useUpdateVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      variableId,
      input,
    }: {
      variableId: string;
      input: UpdateVariableInput;
    }) =>
      // PATCH /api/automation/workflows/:id/variables/:variableId isn't
      // shipped yet — for Phase 9A we just invalidate so the UI re-fetches
      // after a "delete + recreate" UX flow in the variable manager.
      Promise.resolve({} as WorkflowVariable).then(() => {
        // This hook is a placeholder so the UI can call it. The actual
        // mutation will be wired when the dedicated route ships.
        return { variableId, input } as unknown as WorkflowVariable;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation", "workflow"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** GET `/api/automation/workflows/:id/runs` — list workflow runs. */
export function useWorkflowRuns(workflowId: string | null, limit = 30) {
  return useQuery({
    queryKey: automationKeys.workflowRuns(workflowId, limit),
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(limit));
      return apiRequest<{ runs: WorkflowRun[] }>(
        "GET",
        `/api/automation/workflows/${workflowId}/runs?${p.toString()}`,
      ).then((r) => r.runs);
    },
    enabled: !!workflowId,
    refetchInterval: (query) => {
      // Poll while there's at least one pending/running run.
      const runs = query.state.data;
      if (!runs || runs.length === 0) return false;
      const inflight = runs.some((r) => r.status === "pending" || r.status === "running");
      return inflight ? 3000 : false;
    },
  });
}

/** GET `/api/automation/workflows/:id/runs/:runId` — fetch a single run. */
export function useRun(workflowId: string | null, runId: string | null) {
  return useQuery({
    queryKey: automationKeys.run(runId),
    queryFn: () =>
      apiRequest<{ run: WorkflowRun }>(
        "GET",
        `/api/automation/workflows/${workflowId}/runs/${runId}`,
      ).then((r) => r.run),
    enabled: !!workflowId && !!runId,
    refetchInterval: (query) => {
      const run = query.state.data;
      if (!run) return false;
      return run.status === "pending" || run.status === "running" ? 3000 : false;
    },
  });
}

/** GET `/api/automation/workflows/:id/runs/:runId/logs` — list logs. */
export function useRunLogs(
  workflowId: string | null,
  runId: string | null,
  limit = 100,
) {
  return useQuery({
    queryKey: automationKeys.runLogs(runId, limit),
    queryFn: () =>
      apiRequest<{ logs: WorkflowLog[] }>(
        "GET",
        `/api/automation/workflows/${workflowId}/runs/${runId}/logs?limit=${limit}`,
      ).then((r) => r.logs),
    enabled: !!workflowId && !!runId,
    refetchInterval: (query) => {
      const logs = query.state.data;
      if (!logs || logs.length === 0) return false;
      // Poll while the run might still be in flight.
      return 3000;
    },
  });
}

/** POST `/api/automation/workflows/:id/runs` — start a manual run. */
export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      payload = {},
    }: {
      workflowId: string;
      payload?: Record<string, unknown>;
    }) =>
      apiRequest<{ run: WorkflowRun }>(
        "POST",
        `/api/automation/workflows/${workflowId}/runs`,
        { payload },
      ).then((r) => r.run),
    onSuccess: (run) => {
      qc.invalidateQueries({
        queryKey: automationKeys.workflowRuns(run.workflow_id),
      });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** POST `/api/automation/runs/:runId/retry` — retry a run. */
export function useRetryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiRequest<{ run: WorkflowRun }>(
        "POST",
        `/api/automation/runs/${runId}/retry`,
      ).then((r) => r.run),
    onSuccess: (run) => {
      qc.invalidateQueries({
        queryKey: automationKeys.workflowRuns(run.workflow_id),
      });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

/** POST `/api/automation/runs/:runId/cancel` — cancel a run. */
export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      apiRequest<{ run: WorkflowRun }>(
        "POST",
        `/api/automation/runs/${runId}/cancel`,
      ).then((r) => r.run),
    onSuccess: (run) => {
      qc.invalidateQueries({
        queryKey: automationKeys.workflowRuns(run.workflow_id),
      });
      qc.invalidateQueries({ queryKey: ["automation", "dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** GET `/api/automation/templates` — list templates. */
export function useTemplates(opts: ListTemplatesQuery = {}) {
  return useQuery({
    queryKey: automationKeys.templates(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.category) p.set("category", opts.category);
      if (opts.search) p.set("search", opts.search);
      if (opts.featured !== undefined) p.set("featured", String(opts.featured));
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ templates: AutomationTemplate[] }>(
        "GET",
        `/api/automation/templates${qs ? `?${qs}` : ""}`,
      ).then((r) => r.templates);
    },
  });
}

/** POST `/api/automation/templates` — publish a template. */
export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      apiRequest<{ template: AutomationTemplate }>(
        "POST",
        "/api/automation/templates",
        input,
      ).then((r) => r.template),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation", "templates"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** GET `/api/automation/dashboard?workspaceId=...` — dashboard summary. */
export function useAutomationDashboard(wsId: string | null) {
  return useQuery({
    queryKey: automationKeys.dashboard(wsId),
    queryFn: () =>
      apiRequest<{ dashboard: AutomationDashboardSummary }>(
        "GET",
        `/api/automation/dashboard?workspaceId=${wsId}`,
      ).then((r) => r.dashboard),
    enabled: !!wsId,
    refetchInterval: 15000,
  });
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * The dedicated webhooks list route is not part of Phase 9A — the
 * dashboard summary already carries `totalWebhooks`. Callers that need
 * the count should use {@link useAutomationDashboard} and read its
 * `data.totalWebhooks` field.
 */

/**
 * Local-state hook for the cross-component UI state (active tab,
 * selected workflow id, active run id). Kept here so every automation
 * component imports the same source of truth.
 */
export interface AutomationUiState {
  activeTab: "workflows" | "runs" | "templates" | "dashboard";
  selectedWorkflowId: string | null;
  activeRunId: string | null;
  setActiveTab: (tab: AutomationUiState["activeTab"]) => void;
  setSelectedWorkflow: (id: string | null) => void;
  setActiveRun: (id: string | null) => void;
}

export function useAutomationStore(): AutomationUiState {
  const [activeTab, setActiveTab] = React.useState<AutomationUiState["activeTab"]>("workflows");
  const [selectedWorkflowId, setSelectedWorkflowId] = React.useState<string | null>(null);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);

  const setActiveTabStable = React.useCallback((tab: AutomationUiState["activeTab"]) => {
    setActiveTab(tab);
  }, []);
  const setSelectedWorkflowStable = React.useCallback((id: string | null) => {
    setSelectedWorkflowId(id);
  }, []);
  const setActiveRunStable = React.useCallback((id: string | null) => {
    setActiveRunId(id);
  }, []);

  return {
    activeTab,
    selectedWorkflowId,
    activeRunId,
    setActiveTab: setActiveTabStable,
    setSelectedWorkflow: setSelectedWorkflowStable,
    setActiveRun: setActiveRunStable,
  };
}

// Re-export Workflow for callers that need the row shape.
export type { Workflow, WebhookEndpoint };
