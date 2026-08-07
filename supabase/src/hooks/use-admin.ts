"use client";

/**
 * Supa AI — `useAdmin` (Phase 3 admin monitoring hooks).
 *
 * TanStack Query hooks that wrap the three read endpoints powering the
 * admin monitoring dashboard:
 *
 *   - `useProviderHealth()` — GET `/api/chat/health`
 *       Returns the per-provider rolling health snapshot
 *       (`provider_health` rows: success/error counts, avg latency,
 *        last check, last error).
 *
 *   - `useAdminUsage()` — GET `/api/chat/usage`
 *       Returns the **current user's** month-to-date usage
 *       (total tokens, total cost, request count, period). This is a
 *       HONEST proxy for admin-wide metrics — the platform doesn't yet
 *       expose a server-side aggregation endpoint that joins `ai_usage`
 *       across all users. The UI surfaces this caveat explicitly.
 *
 *   - `useModelCatalog()` — GET `/api/chat/models`
 *       Returns the model catalog (`ProviderGroup[]` of enabled models
 *       from configured providers only). Used by the model catalog
 *       table. The route filters out disabled models and providers
 *       without an API key configured — that's an honest signal.
 *
 * All requests use relative URLs + `credentials: "include"` so the
 * Supabase auth cookie travels with every call. Errors are normalized
 * into a `{ message, code? }` shape via {@link unwrapApiError}, matching
 * the convention established in `use-settings.ts`.
 *
 * @module @/hooks/use-admin
 */
import { useQuery } from "@tanstack/react-query";

import type { ApiResponse } from "@/types/api";
import type { AIProvider } from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

/** Centralized query-key factory so invalidations stay consistent. */
export const adminKeys = {
  health: ["admin", "provider-health"] as const,
  usage: ["admin", "usage"] as const,
  models: ["admin", "models"] as const,
};

// ---------------------------------------------------------------------------
// Types — mirror the shapes returned by the API routes
// ---------------------------------------------------------------------------

/**
 * A single provider's health row, as returned by `GET /api/chat/health`.
 *
 * Mirrors `Tables<'provider_health'>` but kept structurally-typed so the
 * client doesn't pull in the entire Supabase `Database` type.
 */
export interface ProviderHealthEntry {
  id: string;
  provider: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  success_count: number;
  error_count: number;
  avg_latency_ms: number | null;
  last_check_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Response shape from `GET /api/chat/health`. */
export interface ProviderHealthResponse {
  providers: ProviderHealthEntry[];
}

/** Response shape from `GET /api/chat/usage`. */
export interface AdminUsageResponse {
  totalTokens: number;
  totalCostCents: number;
  requestCount: number;
  period: { start: string; end: string };
}

/**
 * A model entry returned by `GET /api/chat/models`.
 *
 * The route returns a *subset* of {@link ManagedModel} fields — `enabled`,
 * `sortOrder`, and `description` are intentionally omitted or filtered
 * server-side (only enabled models from configured providers are returned).
 */
export interface CatalogModel {
  id: string;
  label: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostCentsPer1K: number;
  outputCostCentsPer1K: number;
  capabilities: {
    chat: boolean;
    streaming: boolean;
    tools: boolean;
    vision: boolean;
    json_mode: boolean;
  };
  tier: "free" | "starter" | "pro" | "business" | "enterprise";
  description: string;
}

/** A provider + its visible models, as returned by `GET /api/chat/models`. */
export interface CatalogProviderGroup {
  provider: AIProvider;
  label: string;
  models: CatalogModel[];
}

/** Response shape from `GET /api/chat/models`. */
export interface ModelCatalogResponse {
  groups: CatalogProviderGroup[];
  availableProviders: AIProvider[];
  defaultProvider: AIProvider;
  defaultModel: string;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

/**
 * Normalized error shape consumed by the UI. Mirrors the `use-settings`
 * error contract so the same `<ApiError/>`-style rendering works.
 */
export interface AdminApiError {
  message: string;
  code?: string;
}

async function unwrapApiError(res: Response): Promise<AdminApiError> {
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    return { message: `Request failed (${res.status}).` };
  }

  const envelope = raw as ApiResponse<never>;
  if (envelope && envelope.success === false && envelope.error) {
    return {
      message: envelope.error.message,
      code: envelope.error.code,
    };
  }
  return { message: `Request failed (${res.status}).` };
}

/**
 * Issue a GET request and either return the typed `data` payload or throw
 * a normalized {@link AdminApiError}.
 */
async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) {
    throw await unwrapApiError(res);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw {
      message: json.error?.message ?? "Unexpected response shape.",
      code: json.error?.code,
    } as AdminApiError;
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * GET `/api/chat/health` — provider health snapshot.
 *
 * Stale time: 15s. The admin dashboard auto-refreshes on focus; a 15s
 * window balances freshness against unnecessary load on the
 * `provider_health` table.
 */
export function useProviderHealth() {
  return useQuery({
    queryKey: adminKeys.health,
    queryFn: () => apiGet<ProviderHealthResponse>("/api/chat/health"),
    staleTime: 15 * 1000,
  });
}

/**
 * GET `/api/chat/usage` — current user's month-to-date usage.
 *
 * HONEST CAVEAT: this endpoint is scoped to the *caller* — it does not
 * aggregate across all users. The admin UI surfaces this explicitly via
 * an inline note. A true admin-wide view requires a server-side
 * aggregation endpoint over `ai_usage` (Phase 4+).
 *
 * Stale time: 30s — usage is a slower-moving signal than health.
 */
export function useAdminUsage() {
  return useQuery({
    queryKey: adminKeys.usage,
    queryFn: () => apiGet<AdminUsageResponse>("/api/chat/usage"),
    staleTime: 30 * 1000,
  });
}

/**
 * GET `/api/chat/models` — model catalog (enabled models from configured
 * providers only).
 *
 * Stale time: 5min — the catalog changes only on deploys or operator
 * toggles, so a longer window is fine.
 */
export function useModelCatalog() {
  return useQuery({
    queryKey: adminKeys.models,
    queryFn: () => apiGet<ModelCatalogResponse>("/api/chat/models"),
    staleTime: 5 * 60 * 1000,
  });
}
