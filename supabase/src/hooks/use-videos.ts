"use client";

/**
 * Supa AI — Phase 5 AI Video data hooks.
 *
 * TanStack Query wrappers for every `/api/video/*` REST endpoint the
 * video UI consumes. Each hook returns the standard TanStack Query
 * result; mutations invalidate the relevant query keys so the UI stays
 * in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * @module @/hooks/use-videos
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  GenerateVideoRequest,
  ListVideoOptions,
  VideoGeneration,
  VideoJob,
  VideoUpload,
  VideoUsageSummary,
} from "@/lib/video/client";

/** Alias used by the UI (plural reads more naturally at call sites). */
export type ListVideosOptions = ListVideoOptions;

// ---------------------------------------------------------------------------
// Catalog response shape (returned by `/api/video/models`)
// ---------------------------------------------------------------------------

/** One catalog model entry returned by `/api/video/models`. */
export interface CatalogVideoModel {
  id: string;
  provider: string;
  modelId: string;
  name: string;
  description: string | null;
  maxDuration: number | null;
  supportedResolutions: string[];
  supportedTypes: string[];
  isActive: boolean;
  source: "db" | "provider";
}

/** Catalog group returned by `/api/video/models`. */
export interface CatalogVideoGroup {
  provider: string;
  models: CatalogVideoModel[];
}

/** Response shape returned by GET `/api/video/models`. */
export interface VideoModelsResponse {
  groups: CatalogVideoGroup[];
  availableProviders: string[];
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const videoKeys = {
  all: ["video"] as const,
  history: (opts?: ListVideoOptions) =>
    [
      "video",
      "history",
      opts?.status ?? null,
      opts?.provider ?? null,
      opts?.type ?? null,
      opts?.search ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  detail: (id: string | null) =>
    ["video", "detail", id ?? null] as const,
  models: ["video", "models"] as const,
  jobs: (opts?: { status?: string; limit?: number; offset?: number }) =>
    [
      "video",
      "jobs",
      opts?.status ?? null,
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  job: (id: string | null) => ["video", "job", id ?? null] as const,
  usage: ["video", "usage"] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface VideoApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<VideoApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return { message: `Request failed (${res.status}).`, status: res.status };
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
    } as VideoApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// History (list + detail + delete)
// ---------------------------------------------------------------------------

/** GET `/api/video/history` — paginated list of the caller's generations. */
export function useVideoHistory(opts: ListVideoOptions = {}) {
  return useQuery({
    queryKey: videoKeys.history(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.status) p.set("status", opts.status);
      if (opts.provider) p.set("provider", opts.provider);
      if (opts.type) p.set("type", opts.type);
      if (opts.search) p.set("search", opts.search);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ generations: VideoGeneration[] }>(
        "GET",
        `/api/video/history${qs ? `?${qs}` : ""}`,
      ).then((r) => r.generations);
    },
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/video/history/:id` — fetch a single generation. */
export function useVideo(id: string | null) {
  return useQuery({
    queryKey: videoKeys.detail(id),
    queryFn: () =>
      apiRequest<{ generation: VideoGeneration }>(
        "GET",
        `/api/video/history/${id}`,
      ).then((r) => r.generation),
    enabled: !!id,
  });
}

/** DELETE `/api/video/history/:id` — hard-delete. */
export function useDeleteVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/video/history/${id}`,
      ).then((r) => r.deleted),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", "history"] });
      qc.invalidateQueries({ queryKey: videoKeys.usage });
    },
  });
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

/** POST `/api/video/generate` — enqueue a new generation. */
export function useGenerateVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateVideoRequest) =>
      apiRequest<{ generation: VideoGeneration }>(
        "POST",
        "/api/video/generate",
        input,
      ).then((r) => r.generation),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", "history"] });
      qc.invalidateQueries({ queryKey: videoKeys.jobs() });
      qc.invalidateQueries({ queryKey: videoKeys.usage });
    },
  });
}

// ---------------------------------------------------------------------------
// Models (catalog)
// ---------------------------------------------------------------------------

/** GET `/api/video/models` — provider-grouped catalog. */
export function useVideoModels() {
  return useQuery({
    queryKey: videoKeys.models,
    queryFn: () => apiRequest<VideoModelsResponse>("GET", "/api/video/models"),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/** GET `/api/video/jobs` — paginated list of the caller's jobs. */
export function useVideoJobs(opts: { status?: string; limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: videoKeys.jobs(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ jobs: VideoJob[] }>(
        "GET",
        `/api/video/jobs${qs ? `?${qs}` : ""}`,
      ).then((r) => r.jobs);
    },
    // Refresh jobs every 5s while there are in-flight ones — the
    // underlying route polls the provider on each request, so this
    // keeps the UI in sync without a separate websocket.
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const anyPending = jobs.some(
        (j) => j.status === "pending" || j.status === "processing",
      );
      return anyPending ? 5000 : false;
    },
  });
}

/** GET `/api/video/jobs/:id` — fetch a single job + force a provider poll. */
export function useVideoJob(id: string | null) {
  return useQuery({
    queryKey: videoKeys.job(id),
    queryFn: () =>
      apiRequest<{ job: VideoJob & { generation: VideoGeneration | null }; generation: VideoGeneration | null }>(
        "GET",
        `/api/video/jobs/${id}`,
      ).then((r) => r.job),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return false;
      if (job.status === "pending" || job.status === "processing") return 3000;
      return false;
    },
  });
}

/** POST `/api/video/jobs/:id` — retry or cancel. */
export function useVideoJobAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "retry" | "cancel";
    }) =>
      apiRequest<{ job: VideoJob }>(
        "POST",
        `/api/video/jobs/${id}`,
        { action },
      ).then((r) => r.job),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", "jobs"] });
      qc.invalidateQueries({ queryKey: ["video", "history"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Upload (multipart)
// ---------------------------------------------------------------------------

/** POST `/api/video/upload` — multipart upload of a source video. */
export function useUploadVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      duration?: number;
      width?: number;
      height?: number;
    }): Promise<VideoUpload> => {
      const form = new FormData();
      form.append("file", input.file);
      if (input.duration !== undefined) form.append("duration", String(input.duration));
      if (input.width !== undefined) form.append("width", String(input.width));
      if (input.height !== undefined) form.append("height", String(input.height));
      const res = await fetch("/api/video/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw await unwrapError(res);
      const json = (await res.json()) as ApiResponse<VideoUpload>;
      if (!json.success) {
        throw {
          message: json.error?.message ?? "Upload failed.",
          code: json.error?.code,
        } as VideoApiError;
      }
      return json.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["video", "uploads"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** GET `/api/video/usage` — current-month usage summary. */
export function useVideoUsage() {
  return useQuery({
    queryKey: videoKeys.usage,
    queryFn: () => apiRequest<VideoUsageSummary>("GET", "/api/video/usage"),
    staleTime: 30 * 1000,
  });
}
