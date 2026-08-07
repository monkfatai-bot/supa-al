/**
 * Supa AI — Provider health service (Phase 3).
 *
 * Owns the `provider_health` table — rolling per-provider metrics used by the
 * admin dashboard and (lightly) by the chat failover policy. The chat
 * service calls {@link ProviderHealthService.recordRequest} after every AI
 * call (success or failure) so the metrics stay fresh without a separate
 * health-check job.
 *
 * The service uses the **admin** Supabase client for writes: the
 * `provider_health` table has no RLS insert/update policy (only a SELECT
 * policy), so writes must come from the service role.
 *
 * @module @/lib/chat/provider-health
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { Tables, TablesUpdate } from "@/lib/supabase/types";

/** Row shape for the `provider_health` table. */
export type ProviderHealth = Tables<"provider_health">;

/** Input for {@link ProviderHealthService.recordRequest}. */
export interface ProviderRequestOutcome {
  /** Whether the request succeeded. */
  success: boolean;
  /** Latency in milliseconds. */
  latencyMs?: number;
  /** Error message (when `success === false`). */
  error?: string;
}

/**
 * Rolling-average window. We approximate a true rolling average by keeping
 * the existing `avg_latency_ms` and blending in the new sample at a 1/N
 * weight, where N is the total request count (success + error). This is the
 * same scheme used by the rolling-average counters in the platform's
 * rate-limiter and avoids needing to store per-sample history.
 */
const ROLLING_ALPHA_DIVISOR_MAX = 1000;

class ProviderHealthService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Record a single request's outcome against the provider's health row.
   *
   * - Increments `success_count` or `error_count`.
   * - Recomputes `avg_latency_ms` as a rolling average blending the prior
   *   average with the new sample (weight = 1 / total_count).
   * - Sets `last_check_at` to now; sets `last_error` when `success === false`.
   * - Recomputes `status`: `healthy` when error rate < 5%, `degraded` when
   *   < 50%, `down` otherwise. A provider with zero requests is `unknown`.
   *
   * Idempotent on `provider` (the table has a UNIQUE constraint); the first
   * call for a provider creates the row, subsequent calls update it.
   */
  async recordRequest(
    provider: string,
    outcome: ProviderRequestOutcome,
  ): Promise<void> {
    try {
      // Read existing row (if any) so we can compute the new rolling average
      // and status atomically on the client side, then upsert.
      const existing = await this.getStatus(provider);
      const successCount = (existing?.success_count ?? 0) + (outcome.success ? 1 : 0);
      const errorCount = (existing?.error_count ?? 0) + (outcome.success ? 0 : 1);
      const total = successCount + errorCount;

      // Rolling average latency: blend prior avg with new sample.
      let avgLatency: number | null = existing?.avg_latency_ms ?? null;
      if (outcome.latencyMs !== undefined && outcome.latencyMs > 0) {
        const prior = avgLatency ?? outcome.latencyMs;
        const n = Math.min(total, ROLLING_ALPHA_DIVISOR_MAX);
        avgLatency = Math.round(prior + (outcome.latencyMs - prior) / Math.max(1, n));
      }

      const status = this.computeStatus(successCount, errorCount);
      const patch: TablesUpdate<"provider_health"> = {
        status,
        success_count: successCount,
        error_count: errorCount,
        avg_latency_ms: avgLatency,
        last_check_at: new Date().toISOString(),
        last_error: outcome.success ? null : (outcome.error ?? "Unknown error"),
      };

      if (existing) {
        const { error } = await this.supabase
          .from("provider_health")
          .update(patch)
          .eq("provider", provider);
        if (error) throw this.toDbError(error, "provider_health update failed");
      } else {
        // Insert — the table's UNIQUE(provider) constraint will reject races.
        const { error } = await this.supabase
          .from("provider_health")
          .insert({
            provider,
            ...patch,
          });
        if (error) {
          // 23505 = unique_violation — a concurrent recordRequest for the
          // same provider won the race. Fall back to an update; if THAT
          // fails we surface the error (rare and indicative of a real issue).
          if (error.code === "23505") {
            const { error: updateError } = await this.supabase
              .from("provider_health")
              .update(patch)
              .eq("provider", provider);
            if (updateError) throw this.toDbError(updateError, "provider_health race-update failed");
          } else {
            throw this.toDbError(error, "provider_health insert failed");
          }
        }
      }
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure recording provider health.", {
        provider,
        cause: appErr.message,
      });
    }
  }

  /**
   * Read the current health row for a provider. Returns `null` when the
   * provider has never been recorded (no row exists yet).
   */
  async getStatus(provider: string): Promise<ProviderHealth | null> {
    try {
      const { data, error } = await this.supabase
        .from("provider_health")
        .select()
        .eq("provider", provider)
        .maybeSingle();

      if (error) throw this.toDbError(error, "provider_health getStatus failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading provider health.", {
        provider,
        cause: appErr.message,
      });
    }
  }

  /**
   * List all provider health rows (for the admin dashboard). Sorted by
   * provider id ascending for stable display.
   */
  async listAll(): Promise<ProviderHealth[]> {
    try {
      const { data, error } = await this.supabase
        .from("provider_health")
        .select()
        .order("provider", { ascending: true });

      if (error) throw this.toDbError(error, "provider_health listAll failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing provider health.", {
        cause: appErr.message,
      });
    }
  }

  /**
   * Healthy predicate: a provider is considered healthy enough to serve
   * traffic when its status is `healthy` or `degraded`. `down` and `unknown`
   * return false (the chat failover policy should skip them).
   *
   * Returns `true` for an `unknown` provider that has no row yet — a fresh
   * provider is presumed healthy until evidence says otherwise.
   */
  async isHealthy(provider: string): Promise<boolean> {
    const row = await this.getStatus(provider);
    if (!row) return true;
    return row.status === "healthy" || row.status === "degraded";
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Compute the provider status from success/error counts.
   *
   *   - 0 requests → `unknown`
   *   - error rate < 5% → `healthy`
   *   - error rate < 50% → `degraded`
   *   - else → `down`
   */
  private computeStatus(
    successCount: number,
    errorCount: number,
  ): ProviderHealth["status"] {
    const total = successCount + errorCount;
    if (total === 0) return "unknown";
    const errorRate = errorCount / total;
    if (errorRate < 0.05) return "healthy";
    if (errorRate < 0.5) return "degraded";
    return "down";
  }

  /** Map a Postgrest error into a {@link DatabaseError}. */
  private toDbError(
    error: { code?: string; message?: string; name?: string; details?: unknown },
    message: string,
  ): DatabaseError {
    return new DatabaseError(message, {
      errorCode: error.code,
      errorName: error.name,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }
}

/**
 * Build the canonical {@link ProviderHealthService}. Uses the admin client
 * because writes to `provider_health` go through the chat API server-side
 * (no RLS insert/update policy on the table).
 */
export function createProviderHealthService(): ProviderHealthService {
  const supabase = createSupabaseAdminClient();
  return new ProviderHealthService(supabase);
}

/** Logger-tagged convenience for the chat service: record + log on failure. */
export async function recordProviderOutcome(
  provider: string,
  outcome: ProviderRequestOutcome,
): Promise<void> {
  try {
    await createProviderHealthService().recordRequest(provider, outcome);
  } catch (err) {
    // Health recording is best-effort — never break a chat request because
    // the health table is unavailable. Log loudly so the operator notices.
    logger.error("provider_health record failed", {
      provider,
      outcome,
      error: String(err),
    });
  }
}
