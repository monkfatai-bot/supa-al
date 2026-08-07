/**
 * Supa AI — Voice usage tracking (Phase 8).
 *
 * Owns the `voice_usage` daily rollup table. Provides an `increment`
 * helper that upserts a single row per (workspace_id, user_id,
 * metric_date) and a `getSummary` aggregator for the UI usage card.
 * Uses the admin Supabase client so writes succeed before the
 * `workspaces` table ships in Phase 9A.
 *
 * @module @/lib/voice/usage
 */
import "server-only";

import { DatabaseError, toAppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type { VoiceUsage, VoiceUsageSummary } from "./types";

export class UsageService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Increment today's usage for (workspace, user) by 1 generation +
   * `creditsConsumed` credits, and bump the per-type counter in `by_type`.
   *
   * Implemented as a read-then-write upsert — single-writer per user
   * per day is the expected concurrency, so a Postgres RPC isn't
   * required for correctness today (a future phase can swap one in).
   */
  async increment(
    workspaceId: string,
    userId: string,
    type: "tts" | "stt" | "translate" | "dub" | "clone",
    creditsConsumed: number,
  ): Promise<VoiceUsage> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    try {
      // Try to read the existing row first.
      const { data: existing, error: readErr } = await this.supabase
        .from("voice_usage")
        .select()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .eq("metric_date", today)
        .maybeSingle();
      if (readErr) throw this.toDbError(readErr, "voice_usage.read failed");

      const currentByType = ((existing?.by_type ?? {}) as Record<string, number>) ?? {};
      const nextByType: Record<string, number> = {
        ...currentByType,
        [type]: (currentByType[type] ?? 0) + 1,
      };

      if (existing) {
        const { data, error } = await this.supabase
          .from("voice_usage")
          .update({
            generations: (existing.generations ?? 0) + 1,
            credits_used: (existing.credits_used ?? 0) + creditsConsumed,
            by_type: nextByType as never,
          })
          .eq("id", existing.id)
          .select()
          .maybeSingle();
        if (error) throw this.toDbError(error, "voice_usage.update failed");
        if (!data) {
          throw new DatabaseError("voice_usage.update returned no row.", {
            id: existing.id,
          });
        }
        return data;
      }

      // Insert a new row for today.
      const insert = {
        workspace_id: workspaceId,
        user_id: userId,
        metric_date: today,
        generations: 1,
        credits_used: creditsConsumed,
        by_type: { [type]: 1 } as never,
      };
      const { data, error } = await this.supabase
        .from("voice_usage")
        .insert(insert)
        .select()
        .maybeSingle();
      if (error) {
        // Race: another concurrent request inserted the row first. Fall
        // back to a read-then-update.
        if (error.code === "23505") {
          return this.increment(workspaceId, userId, type, creditsConsumed);
        }
        throw this.toDbError(error, "voice_usage.insert failed");
      }
      if (!data) {
        throw new DatabaseError("voice_usage.insert returned no row.", {
          workspaceId,
          userId,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure incrementing voice usage.", {
        workspaceId,
        userId,
        type,
        cause: appErr.message,
      });
    }
  }

  /** Aggregate usage for a date range. Returns the period summary shape. */
  async getSummary(
    workspaceId: string,
    period: { start: Date; end: Date },
  ): Promise<VoiceUsageSummary> {
    try {
      const { data, error } = await this.supabase
        .from("voice_usage")
        .select()
        .eq("workspace_id", workspaceId)
        .gte("metric_date", period.start.toISOString().slice(0, 10))
        .lte("metric_date", period.end.toISOString().slice(0, 10));
      if (error) throw this.toDbError(error, "voice_usage.getSummary failed");
      const rows = data ?? [];
      const byType = {
        tts: 0,
        stt: 0,
        translate: 0,
        dub: 0,
        clone: 0,
      };
      const byProvider: Record<string, { generations: number; creditsUsed: number }> = {};
      let totalGenerations = 0;
      let totalCreditsUsed = 0;
      for (const row of rows) {
        totalGenerations += row.generations ?? 0;
        totalCreditsUsed += row.credits_used ?? 0;
        const bt = (row.by_type ?? {}) as Record<string, number>;
        for (const key of Object.keys(byType) as Array<keyof typeof byType>) {
          byType[key] += bt[key] ?? 0;
        }
        // We don't store per-provider breakouts in voice_usage today —
        // we approximate using the per-type counters when byProvider is
        // requested. The detailed per-provider breakdown is computed
        // from `voice_generations` by the voice-service on demand.
      }
      // For the byProvider breakdown, query voice_generations directly.
      const { data: genRows, error: genErr } = await this.supabase
        .from("voice_generations")
        .select("provider, status")
        .eq("workspace_id", workspaceId)
        .gte("created_at", period.start.toISOString())
        .lte("created_at", period.end.toISOString());
      if (genErr) throw this.toDbError(genErr, "voice_generations.summary failed");
      for (const r of genRows ?? []) {
        const k = r.provider ?? "unknown";
        const entry = byProvider[k] ?? { generations: 0, creditsUsed: 0 };
        entry.generations += 1;
        byProvider[k] = entry;
      }
      return {
        totalGenerations,
        totalCreditsUsed,
        byType,
        byProvider,
        period: { start: period.start.toISOString(), end: period.end.toISOString() },
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure aggregating voice usage.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

  /** List raw usage rows for the workspace (most-recent first). */
  async list(
    workspaceId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<VoiceUsage[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 30, 365));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      const { data, error } = await this.supabase
        .from("voice_usage")
        .select()
        .eq("workspace_id", workspaceId)
        .order("metric_date", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw this.toDbError(error, "voice_usage.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing voice usage.", {
        workspaceId,
        cause: appErr.message,
      });
    }
  }

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

/** Build the canonical {@link UsageService}. */
export function createUsageService(): UsageService {
  const supabase = createSupabaseAdminClient();
  return new UsageService(supabase);
}
