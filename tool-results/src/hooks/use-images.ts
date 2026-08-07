"use client";

/**
 * Supa AI — Phase 4 image data hooks.
 *
 * TanStack Query wrappers for every `/api/images/*` REST endpoint the
 * image UI consumes. Each hook returns the standard TanStack Query
 * result; mutations invalidate the relevant query keys so the UI stays
 * in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * @module @/hooks/use-images
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  GenerateImageInput,
  ImageGeneration,
  ImageModelRow,
  ImageStyle,
  ImageUsageStats,
  ImageUpload,
  ListImagesQuery,
} from "@/lib/image/client";
import type { EditImageInput } from "@/lib/validation/image";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const imageKeys = {
  all: ["images"] as const,
  history: (opts?: ListImagesQuery) =>
    [
      "images",
      "history",
      opts?.status ?? null,
      opts?.provider ?? null,
      opts?.model ?? null,
      opts?.search ?? "",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  detail: (id: string | null) =>
    ["images", "detail", id ?? null] as const,
  models: ["images", "models"] as const,
  styles: ["images", "styles"] as const,
  usage: (opts?: { from?: string; to?: string }) =>
    ["images", "usage", opts?.from ?? null, opts?.to ?? null] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Normalized error shape consumed by the UI. */
export interface ImageApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<ImageApiError> {
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
 * throw a normalized {@link ImageApiError}.
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
    } as ImageApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** GET `/api/images/history` — paginated list of the caller's generations. */
export function useImageHistory(opts: ListImagesQuery = {}) {
  return useQuery({
    queryKey: imageKeys.history(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.status) p.set("status", opts.status);
      if (opts.provider) p.set("provider", opts.provider);
      if (opts.model) p.set("model", opts.model);
      if (opts.search) p.set("search", opts.search);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ generations: ImageGeneration[] }>(
        "GET",
        `/api/images/history${qs ? `?${qs}` : ""}`,
      ).then((r) => r.generations);
    },
    placeholderData: (prev) => prev,
    staleTime: 5 * 1000,
  });
}

/** GET `/api/images/history/:id` — fetch a single generation. */
export function useImageDetail(id: string | null) {
  return useQuery({
    queryKey: imageKeys.detail(id),
    queryFn: () =>
      apiRequest<{ generation: ImageGeneration }>(
        "GET",
        `/api/images/history/${id}`,
      ).then((r) => r.generation),
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/** GET `/api/images/models` — list active image models. */
export function useImageModels() {
  return useQuery({
    queryKey: imageKeys.models,
    queryFn: () =>
      apiRequest<{ models: ImageModelRow[] }>(
        "GET",
        "/api/images/models",
      ).then((r) => r.models),
    staleTime: 5 * 60 * 1000, // 5 min — the catalog rarely changes.
  });
}

/** GET `/api/images/styles` — list curated image styles. */
export function useImageStyles() {
  return useQuery({
    queryKey: imageKeys.styles,
    queryFn: () =>
      apiRequest<{ styles: ImageStyle[] }>(
        "GET",
        "/api/images/styles",
      ).then((r) => r.styles),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** GET `/api/images/usage` — aggregate usage stats. */
export function useImageUsage(opts: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: imageKeys.usage(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.from) p.set("from", opts.from);
      if (opts.to) p.set("to", opts.to);
      const qs = p.toString();
      return apiRequest<{ usage: ImageUsageStats }>(
        "GET",
        `/api/images/usage${qs ? `?${qs}` : ""}`,
      ).then((r) => r.usage);
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** POST `/api/images/generate` — generate a new image. */
export function useGenerateImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateImageInput) =>
      apiRequest<{ generation: ImageGeneration }>(
        "POST",
        "/api/images/generate",
        input,
      ).then((r) => r.generation),
    onSuccess: (generation) => {
      qc.setQueryData(imageKeys.detail(generation.id), { generation });
      qc.invalidateQueries({ queryKey: ["images", "history"] });
      qc.invalidateQueries({ queryKey: imageKeys.usage() });
    },
  });
}

/** DELETE `/api/images/history/:id` — hard-delete a generation. */
export function useDeleteImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ deleted: boolean }>(
        "DELETE",
        `/api/images/history/${id}`,
      ).then((r) => r.deleted),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: imageKeys.detail(id) });
      qc.invalidateQueries({ queryKey: ["images", "history"] });
    },
  });
}

/** POST `/api/images/upload` — upload a source image (multipart). */
export function useUploadImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      file: File;
      width?: number;
      height?: number;
      workspaceId?: string;
    }) => {
      const form = new FormData();
      form.append("file", input.file);
      form.append("fileName", input.file.name);
      if (input.width) form.append("width", String(input.width));
      if (input.height) form.append("height", String(input.height));
      if (input.workspaceId) form.append("workspaceId", input.workspaceId);
      const res = await fetch("/api/images/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw await unwrapError(res);
      const json = (await res.json()) as ApiResponse<{
        upload: ImageUpload;
        signedUrl: string;
      }>;
      if (!json.success) {
        throw {
          message: json.error?.message ?? "Upload failed.",
          code: json.error?.code,
        } as ImageApiError;
      }
      return json.data;
    },
    onSuccess: () => {
      // No query to invalidate — uploads aren't listed in the gallery (yet).
      // A future "uploads" tab can invalidate here.
    },
  });
}

/** POST `/api/images/enhance` — enhance a generation's prompt. */
export function useEnhanceImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditImageInput) =>
      apiRequest<{ generation: ImageGeneration }>(
        "POST",
        "/api/images/enhance",
        input,
      ).then((r) => r.generation),
    onSuccess: (generation) => {
      qc.setQueryData(imageKeys.detail(generation.id), { generation });
      qc.invalidateQueries({ queryKey: ["images", "history"] });
    },
  });
}

/** POST `/api/images/upscale` — upscale a generation. */
export function useUpscaleImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditImageInput) =>
      apiRequest<{ generation: ImageGeneration }>(
        "POST",
        "/api/images/upscale",
        input,
      ).then((r) => r.generation),
    onSuccess: (generation) => {
      qc.setQueryData(imageKeys.detail(generation.id), { generation });
      qc.invalidateQueries({ queryKey: ["images", "history"] });
    },
  });
}

/** POST `/api/images/remove-bg` — remove the background of a generation. */
export function useRemoveImageBackground() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditImageInput) =>
      apiRequest<{ generation: ImageGeneration }>(
        "POST",
        "/api/images/remove-bg",
        input,
      ).then((r) => r.generation),
    onSuccess: (generation) => {
      qc.setQueryData(imageKeys.detail(generation.id), { generation });
      qc.invalidateQueries({ queryKey: ["images", "history"] });
    },
  });
}
