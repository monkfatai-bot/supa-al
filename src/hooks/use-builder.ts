"use client";

/**
 * Supa AI — Phase 9B Builder data hooks.
 *
 * TanStack Query wrappers for every `/api/builder/*` REST endpoint the
 * builder UI consumes. Each hook returns the standard TanStack Query
 * result; mutations invalidate the relevant query keys so the UI stays
 * in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state. The cross-
 * component UI state (selected node, active workflow id, etc.) lives
 * inside {@link BuilderView} via React.useState.
 *
 * @module @/hooks/use-builder
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  NodeDefinition,
  NodeType,
  PreviewResult,
  TemplateCategory,
  ValidationResult,
  WorkflowCollaboration,
  WorkflowComment,
  WorkflowDebugSession,
  WorkflowEdge,
  WorkflowExport,
  WorkflowGraph,
  WorkflowLayout,
  WorkflowNode,
} from "@/lib/builder/client";
import type {
  AddEdgesInput,
  AddNodesInput,
  CreateCommentInput,
  ImportWorkflowInput,
  PreviewInput,
  SaveLayoutInput,
  SaveWorkflowInput,
  UpdateCommentInput,
  UpsertPresenceInput,
  ValidateInput,
} from "@/lib/validation/builder";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const builderKeys = {
  all: ["builder"] as const,
  graph: (workflowId: string | null) =>
    ["builder", "graph", workflowId ?? null] as const,
  nodes: (workflowId: string | null) =>
    ["builder", "nodes", workflowId ?? null] as const,
  edges: (workflowId: string | null) =>
    ["builder", "edges", workflowId ?? null] as const,
  layout: (workflowId: string | null) =>
    ["builder", "layout", workflowId ?? null] as const,
  comments: (workflowId: string | null) =>
    ["builder", "comments", workflowId ?? null] as const,
  debug: (workflowId: string | null) =>
    ["builder", "debug", workflowId ?? null] as const,
  presence: (workflowId: string | null) =>
    ["builder", "presence", workflowId ?? null] as const,
  catalog: (category?: string) =>
    ["builder", "catalog", category ?? ""] as const,
  templateCategories: ["builder", "template-categories"] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface BuilderApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<BuilderApiError> {
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
 * throw a normalized {@link BuilderApiError}.
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
    } as BuilderApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Graph (load + save)
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/save?workspaceId=…` — load the whole graph. */
export function useWorkflowGraph(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.graph(workflowId),
    queryFn: () =>
      apiRequest<{ graph: WorkflowGraph }>(
        "GET",
        `/api/builder/workflows/${workflowId}/save?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.graph),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/save` — atomically replace the graph. */
export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: SaveWorkflowInput;
    }) =>
      apiRequest<{ graph: WorkflowGraph }>(
        "POST",
        `/api/builder/workflows/${workflowId}/save`,
        input,
      ).then((r) => r.graph),
    onSuccess: (graph, { workflowId }) => {
      qc.setQueryData(builderKeys.graph(workflowId), { graph });
      qc.invalidateQueries({ queryKey: builderKeys.nodes(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.edges(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.layout(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/nodes?workspaceId=…` — list nodes. */
export function useNodes(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.nodes(workflowId),
    queryFn: () =>
      apiRequest<{ nodes: WorkflowNode[] }>(
        "GET",
        `/api/builder/workflows/${workflowId}/nodes?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.nodes),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/nodes` — bulk-insert nodes. */
export function useAddNodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      input,
    }: {
      workflowId: string;
      workspaceId: string;
      input: AddNodesInput;
    }) =>
      apiRequest<{ nodes: WorkflowNode[] }>(
        "POST",
        `/api/builder/workflows/${workflowId}/nodes`,
        { ...input, workspaceId },
      ).then((r) => r.nodes),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.nodes(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.graph(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/edges?workspaceId=…` — list edges. */
export function useEdges(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.edges(workflowId),
    queryFn: () =>
      apiRequest<{ edges: WorkflowEdge[] }>(
        "GET",
        `/api/builder/workflows/${workflowId}/edges?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.edges),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/edges` — bulk-insert edges. */
export function useAddEdges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      input,
    }: {
      workflowId: string;
      workspaceId: string;
      input: AddEdgesInput;
    }) =>
      apiRequest<{ edges: WorkflowEdge[] }>(
        "POST",
        `/api/builder/workflows/${workflowId}/edges`,
        { ...input, workspaceId },
      ).then((r) => r.edges),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.edges(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.graph(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/layout?workspaceId=…` — get layout. */
export function useLayout(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.layout(workflowId),
    queryFn: () =>
      apiRequest<{ layout: WorkflowLayout | null }>(
        "GET",
        `/api/builder/workflows/${workflowId}/layout?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.layout),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/layout` — upsert layout. */
export function useSaveLayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      input,
    }: {
      workflowId: string;
      workspaceId: string;
      input: SaveLayoutInput;
    }) =>
      apiRequest<{ layout: WorkflowLayout }>(
        "POST",
        `/api/builder/workflows/${workflowId}/layout`,
        { ...input, workspaceId },
      ).then((r) => r.layout),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.layout(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.graph(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Validate / preview
// ---------------------------------------------------------------------------

/** POST `/api/builder/workflows/:id/validate` — validate the graph. */
export function useValidateWorkflow() {
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: ValidateInput;
    }) =>
      apiRequest<{ result: ValidationResult }>(
        "POST",
        `/api/builder/workflows/${workflowId}/validate`,
        input,
      ).then((r) => r.result),
  });
}

/** POST `/api/builder/workflows/:id/preview` — run an in-memory preview. */
export function usePreviewWorkflow() {
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: PreviewInput;
    }) =>
      apiRequest<{ result: PreviewResult }>(
        "POST",
        `/api/builder/workflows/${workflowId}/preview`,
        input,
      ).then((r) => r.result),
  });
}

// ---------------------------------------------------------------------------
// Debug sessions
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/debug?workspaceId=…` — fetch latest debug session. */
export function useDebugSession(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.debug(workflowId),
    queryFn: () =>
      apiRequest<{ session: WorkflowDebugSession | null }>(
        "GET",
        `/api/builder/workflows/${workflowId}/debug?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.session),
    enabled: !!workspaceId && !!workflowId,
    // Poll while a session is in-flight.
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && (s.status === "running" || s.status === "paused")) {
        return 3000;
      }
      return false;
    },
  });
}

/** POST `/api/builder/workflows/:id/debug` — start / pause / resume / stop. */
export function useMutateDebugSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      action,
    }: {
      workflowId: string;
      workspaceId: string;
      action: "start" | "pause" | "resume" | "stop";
    }) =>
      apiRequest<{ session: WorkflowDebugSession }>(
        "POST",
        `/api/builder/workflows/${workflowId}/debug`,
        { action, workspaceId },
      ).then((r) => r.session),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.debug(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/comments?workspaceId=…` — list comments. */
export function useComments(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: builderKeys.comments(workflowId),
    queryFn: () =>
      apiRequest<{ comments: WorkflowComment[] }>(
        "GET",
        `/api/builder/workflows/${workflowId}/comments?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.comments),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/comments` — create a comment. */
export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: CreateCommentInput;
    }) =>
      apiRequest<{ comment: WorkflowComment }>(
        "POST",
        `/api/builder/workflows/${workflowId}/comments`,
        input,
      ).then((r) => r.comment),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.comments(workflowId) });
    },
  });
}

/** PATCH `/api/builder/workflows/:id/comments/:commentId` — resolve / edit. */
export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      commentId,
      input,
    }: {
      workflowId: string;
      workspaceId: string;
      commentId: string;
      input: UpdateCommentInput;
    }) =>
      apiRequest<{ comment: WorkflowComment }>(
        "PATCH",
        `/api/builder/workflows/${workflowId}/comments/${commentId}?workspaceId=${encodeURIComponent(workspaceId)}`,
        input,
      ).then((r) => r.comment),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.comments(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/export?workspaceId=…` — export graph as JSON. */
export function useExportWorkflow(
  workspaceId: string | null,
  workflowId: string | null,
) {
  return useQuery({
    queryKey: ["builder", "export", workflowId ?? null] as const,
    queryFn: () =>
      apiRequest<{ export: WorkflowExport }>(
        "GET",
        `/api/builder/workflows/${workflowId}/export?workspaceId=${encodeURIComponent(workspaceId ?? "")}`,
      ).then((r) => r.export),
    enabled: !!workspaceId && !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/import?workspaceId=…` — import graph JSON. */
export function useImportWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      workspaceId,
      input,
    }: {
      workflowId: string;
      workspaceId: string;
      input: ImportWorkflowInput;
    }) =>
      apiRequest<{ result: { workflowId: string; nodes: WorkflowNode[]; edges: WorkflowEdge[]; layout: WorkflowLayout | null } }>(
        "POST",
        `/api/builder/workflows/${workflowId}/import?workspaceId=${encodeURIComponent(workspaceId)}`,
        input,
      ).then((r) => r.result),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.graph(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.nodes(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.edges(workflowId) });
      qc.invalidateQueries({ queryKey: builderKeys.layout(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

/** GET `/api/builder/workflows/:id/presence` — list the caller's presence rows. */
export function usePresence(workflowId: string | null) {
  return useQuery({
    queryKey: builderKeys.presence(workflowId),
    queryFn: () =>
      apiRequest<{ presence: WorkflowCollaboration[] }>(
        "GET",
        `/api/builder/workflows/${workflowId}/presence`,
      ).then((r) => r.presence),
    enabled: !!workflowId,
  });
}

/** POST `/api/builder/workflows/:id/presence` — upsert presence. */
export function useUpsertPresence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      workflowId,
      input,
    }: {
      workflowId: string;
      input: UpsertPresenceInput;
    }) =>
      apiRequest<{ presence: WorkflowCollaboration }>(
        "POST",
        `/api/builder/workflows/${workflowId}/presence`,
        input,
      ).then((r) => r.presence),
    onSuccess: (_, { workflowId }) => {
      qc.invalidateQueries({ queryKey: builderKeys.presence(workflowId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Catalog + template categories
// ---------------------------------------------------------------------------

/** GET `/api/builder/node-definitions?category=…` — list node definitions (71). */
export function useNodeDefinitions(category?: NodeType) {
  return useQuery({
    queryKey: builderKeys.catalog(category),
    queryFn: () =>
      apiRequest<{ nodes: NodeDefinition[]; version: number }>(
        "GET",
        `/api/builder/node-definitions${category ? `?category=${category}` : ""}`,
      ).then((r) => r.nodes),
    staleTime: 5 * 60 * 1000, // catalog is static
  });
}

/** GET `/api/builder/template-categories` — list active template categories. */
export function useTemplateCategories() {
  return useQuery({
    queryKey: builderKeys.templateCategories,
    queryFn: () =>
      apiRequest<{ categories: TemplateCategory[] }>(
        "GET",
        `/api/builder/template-categories`,
      ).then((r) => r.categories),
    staleTime: 5 * 60 * 1000,
  });
}
