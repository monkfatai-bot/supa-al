"use client";

/**
 * Supa AI — Phase 8 voice data hooks.
 *
 * TanStack Query wrappers for every `/api/voice/*` REST endpoint the
 * voice UI consumes. Each hook returns the standard TanStack Query
 * result; mutations invalidate the relevant query keys so the UI stays
 * in sync after a successful write.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code?, status? }` shape via {@link unwrapError}.
 *
 * The hooks are deliberately thin — they own no UI state.
 *
 * @module @/hooks/use-voice
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type {
  AudioUpload,
  VoiceGeneration,
  VoiceJob,
  VoiceModel,
  VoiceProfile,
  VoiceTranscript,
  VoiceUsageSummary,
} from "@/lib/voice/client";
import type {
  CloneInput,
  CreateProfileInput,
  DubInput,
  ListHistoryQuery,
  ListJobsQuery,
  ListModelsQuery,
  ListProfilesQuery,
  ListTranscriptsQuery,
  ListUploadsQuery,
  SynthesizeInput,
  TranscribeInput,
  TranslateInput,
} from "@/lib/validation/voice";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const voiceKeys = {
  all: ["voice"] as const,
  models: (opts?: ListModelsQuery) =>
    ["voice", "models", opts?.provider ?? "all", opts?.type ?? "all"] as const,
  history: (opts?: ListHistoryQuery) =>
    [
      "voice",
      "history",
      opts?.type ?? "all",
      opts?.provider ?? "all",
      opts?.status ?? "all",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  transcripts: (opts?: ListTranscriptsQuery) =>
    [
      "voice",
      "transcripts",
      opts?.generationId ?? "all",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  profiles: (opts?: ListProfilesQuery) =>
    [
      "voice",
      "profiles",
      opts?.provider ?? "all",
      opts?.isCloned ?? "all",
      opts?.limit ?? 50,
      opts?.offset ?? 0,
    ] as const,
  uploads: (opts?: ListUploadsQuery) =>
    ["voice", "uploads", opts?.limit ?? 30, opts?.offset ?? 0] as const,
  jobs: (opts?: ListJobsQuery) =>
    [
      "voice",
      "jobs",
      opts?.status ?? "all",
      opts?.generationId ?? "all",
      opts?.limit ?? 30,
      opts?.offset ?? 0,
    ] as const,
  job: (id: string | null) => ["voice", "job", id ?? null] as const,
  usage: ["voice", "usage"] as const,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export interface VoiceApiError {
  message: string;
  code?: string;
  status?: number;
}

async function unwrapError(res: Response): Promise<VoiceApiError> {
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
  if (!res.ok) throw await unwrapError(res);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as VoiceApiError;
  }
  return json.data;
}

async function apiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await unwrapError(res);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Upload failed.",
      code: json.error?.code,
    } as VoiceApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export function useVoiceModels(opts: ListModelsQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.models(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.provider) p.set("provider", opts.provider);
      if (opts.type) p.set("type", opts.type);
      const qs = p.toString();
      return apiRequest<{ models: VoiceModel[] }>(
        "GET",
        `/api/voice/models${qs ? `?${qs}` : ""}`,
      ).then((r) => r.models);
    },
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Synthesize (TTS)
// ---------------------------------------------------------------------------

export function useSynthesize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SynthesizeInput) =>
      apiRequest<{ generation: VoiceGeneration; audioUrl: string }>(
        "POST",
        "/api/voice/synthesize",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "history"] });
      qc.invalidateQueries({ queryKey: voiceKeys.usage });
    },
  });
}

// ---------------------------------------------------------------------------
// Transcribe (STT)
// ---------------------------------------------------------------------------

export function useTranscribe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TranscribeInput) =>
      apiRequest<{ generation: VoiceGeneration; transcript: VoiceTranscript }>(
        "POST",
        "/api/voice/transcribe",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "history"] });
      qc.invalidateQueries({ queryKey: ["voice", "transcripts"] });
      qc.invalidateQueries({ queryKey: voiceKeys.usage });
    },
  });
}

// ---------------------------------------------------------------------------
// Translate / Dub / Clone (async — return generation + job)
// ---------------------------------------------------------------------------

export function useTranslate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TranslateInput) =>
      apiRequest<{ generation: VoiceGeneration; job: VoiceJob }>(
        "POST",
        "/api/voice/translate",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "history"] });
      qc.invalidateQueries({ queryKey: ["voice", "jobs"] });
      qc.invalidateQueries({ queryKey: voiceKeys.usage });
    },
  });
}

export function useDub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DubInput) =>
      apiRequest<{ generation: VoiceGeneration; job: VoiceJob }>(
        "POST",
        "/api/voice/dub",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "history"] });
      qc.invalidateQueries({ queryKey: ["voice", "jobs"] });
      qc.invalidateQueries({ queryKey: voiceKeys.usage });
    },
  });
}

export function useClone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloneInput) =>
      apiRequest<{ generation: VoiceGeneration; job: VoiceJob }>(
        "POST",
        "/api/voice/clone",
        input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "history"] });
      qc.invalidateQueries({ queryKey: ["voice", "jobs"] });
      qc.invalidateQueries({ queryKey: ["voice", "profiles"] });
      qc.invalidateQueries({ queryKey: voiceKeys.usage });
    },
  });
}

// ---------------------------------------------------------------------------
// Audio uploads
// ---------------------------------------------------------------------------

export function useUploadAudio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiUpload<{ upload: AudioUpload }>("/api/voice/upload", file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "uploads"] });
    },
  });
}

export function useAudioUploads(opts: ListUploadsQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.uploads(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ uploads: AudioUpload[] }>(
        "GET",
        `/api/voice/upload${qs ? `?${qs}` : ""}`,
      ).then((r) => r.uploads);
    },
  });
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function useVoiceHistory(opts: ListHistoryQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.history(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.type) p.set("type", opts.type);
      if (opts.provider) p.set("provider", opts.provider);
      if (opts.status) p.set("status", opts.status);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ generations: VoiceGeneration[] }>(
        "GET",
        `/api/voice/history${qs ? `?${qs}` : ""}`,
      ).then((r) => r.generations);
    },
  });
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

export function useVoiceTranscripts(opts: ListTranscriptsQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.transcripts(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.generationId) p.set("generationId", opts.generationId);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ transcripts: VoiceTranscript[] }>(
        "GET",
        `/api/voice/transcripts${qs ? `?${qs}` : ""}`,
      ).then((r) => r.transcripts);
    },
  });
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export function useVoiceProfiles(opts: ListProfilesQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.profiles(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.provider) p.set("provider", opts.provider);
      if (typeof opts.isCloned === "boolean") p.set("isCloned", String(opts.isCloned));
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ profiles: VoiceProfile[] }>(
        "GET",
        `/api/voice/profiles${qs ? `?${qs}` : ""}`,
      ).then((r) => r.profiles);
    },
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfileInput) =>
      apiRequest<{ profile: VoiceProfile }>("POST", "/api/voice/profiles", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "profiles"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export function useVoiceJobs(opts: ListJobsQuery = {}) {
  return useQuery({
    queryKey: voiceKeys.jobs(opts),
    queryFn: () => {
      const p = new URLSearchParams();
      if (opts.status) p.set("status", opts.status);
      if (opts.generationId) p.set("generationId", opts.generationId);
      if (opts.limit) p.set("limit", String(opts.limit));
      if (opts.offset) p.set("offset", String(opts.offset));
      const qs = p.toString();
      return apiRequest<{ jobs: VoiceJob[] }>(
        "GET",
        `/api/voice/jobs${qs ? `?${qs}` : ""}`,
      ).then((r) => r.jobs);
    },
    // Poll for status updates while there are pending/processing jobs.
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      const anyActive = jobs.some(
        (j) => j.status === "pending" || j.status === "processing",
      );
      return anyActive ? 5000 : false;
    },
  });
}

export function useVoiceJob(id: string | null) {
  return useQuery({
    queryKey: voiceKeys.job(id),
    queryFn: () =>
      apiRequest<{ job: VoiceJob }>("GET", `/api/voice/jobs/${id}`).then(
        (r) => r.job,
      ),
    enabled: !!id,
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return false;
      return job.status === "pending" || job.status === "processing"
        ? 3000
        : false;
    },
  });
}

export function useRetryVoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ job: VoiceJob }>("POST", `/api/voice/jobs/${id}`, {
        action: "retry",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "jobs"] });
    },
  });
}

export function useCancelVoiceJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ job: VoiceJob }>("POST", `/api/voice/jobs/${id}`, {
        action: "cancel",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voice", "jobs"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export function useVoiceUsage() {
  return useQuery({
    queryKey: voiceKeys.usage,
    queryFn: () =>
      apiRequest<VoiceUsageSummary>("GET", "/api/voice/usage"),
    staleTime: 30 * 1000,
  });
}
