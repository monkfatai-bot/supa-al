/**
 * Supa AI — Phase 5 AI Video — usage tracking service.
 *
 * Owns the `video_usage` per-day rollup table for the video surface.
 * The job queue calls `recordGeneration` after every successful
 * generation; the `/api/video/usage` route reads the current-month
 * summary via `getMonthlySummary`.
 *
 * The upsert uses the table's `UNIQUE(workspace_id, user_id,
 * metric_date)` constraint so concurrent record calls (e.g. two jobs
 * finishing at the same moment) don't race to create duplicate rows.
 *
 * @module @/lib/video/usage
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { VideoUsage, VideoUsageSummary } from "./types";

const BY_PROVIDER_PATH = "by_provider" as const;

export class VideoUsageService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Record one completed generation against the caller's per-day rollup
   * row. Best-effort — never throws (a usage-tracking failure must not
   * break a generation response).
   */
  async recordGeneration(opts: {
    workspaceId: string;
    userId: string;
    provider: string;
    creditsConsumed: number;
    metricDate?: string;
  }): Promise<void> {
    const metricDate = opts.metricDate ?? new Date().toISOString().slice(0, 10);
    try {
      const { data: existing, error: selError } = await this.supabase
        .from("video_usage")
        .select()
        .eq("workspace_id", opts.workspaceId)
        .eq("user_id", opts.userId)
        .eq("metric_date", metricDate)
        .maybeSingle();
      if (selError) throw this.toDbError(selError, "video_usage.select failed");

      const prior = (existing ?? null) as VideoUsage | null;
      const nextVideos = (prior?.videos_generated ?? 0) + 1;
      const nextCredits = (prior?.credits_used ?? 0) + opts.creditsConsumed;
      const byProvider = this.mergeProvider(
        prior?.by_provider as Record<string, { count: number; credits: number }> | null,
        opts.provider,
        opts.creditsConsumed,
      );

      if (prior) {
        const { error: updError } = await this.supabase
          .from("video_usage")
          .update({
            videos_generated: nextVideos,
            credits_used: nextCredits,
            by_provider: byProvider as never,
          })
          .eq("id", prior.id);
        if (updError) throw this.toDbError(updError, "video_usage.update failed");
      } else {
        const { error: insError } = await this.supabase
          .from("video_usage")
          .insert({
            workspace_id: opts.workspaceId,
            user_id: opts.userId,
            metric_date: metricDate,
            videos_generated: 1,
            credits_used: opts.creditsConsumed,
            by_provider: byProvider as never,
          });
        // 23505 = unique_violation — a concurrent insert won the race.
        // Fall back to update; if THAT fails we surface the error.
        if (insError && insError.code === "23505") {
          const { error: updError } = await this.supabase
            .from("video_usage")
            .update({
              videos_generated: nextVideos,
              credits_used: nextCredits,
              by_provider: byProvider as never,
            })
            .eq("workspace_id", opts.workspaceId)
            .eq("user_id", opts.userId)
            .eq("metric_date", metricDate);
          if (updError) throw this.toDbError(updError, "video_usage.race-update failed");
        } else if (insError) {
          throw this.toDbError(insError, "video_usage.insert failed");
        }
      }
    } catch (err) {
      // Best-effort: log and continue.
      logger.warn("video_usage.recordGeneration failed", {
        userId: opts.userId,
        provider: opts.provider,
        error: String(err),
      });
    }
  }

  /** Aggregate the caller's usage for the current calendar month. */
  async getMonthlySummary(userId: string): Promise<VideoUsageSummary> {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    try {
      const { data, error } = await this.supabase
        .from("video_usage")
        .select("videos_generated, credits_used, by_provider, metric_date")
        .eq("user_id", userId)
        .gte("metric_date", start.toISOString().slice(0, 10))
        .lte("metric_date", end.toISOString().slice(0, 10));

      if (error) throw this.toDbError(error, "video_usage.summary failed");

      const rows = (data ?? []) as Pick<
        VideoUsage,
        "videos_generated" | "credits_used" | "by_provider" | "metric_date"
      >[];
      const byProvider: Record<string, { count: number; credits: number }> = {};
      let totalVideos = 0;
      let totalCredits = 0;
      for (const row of rows) {
        totalVideos += row.videos_generated ?? 0;
        totalCredits += row.credits_used ?? 0;
        const bp = (row.by_provider ?? {}) as Record<
          string,
          { count: number; credits: number }
        >;
        for (const [key, value] of Object.entries(bp)) {
          const acc = byProvider[key] ?? { count: 0, credits: 0 };
          acc.count += value.count ?? 0;
          acc.credits += value.credits ?? 0;
          byProvider[key] = acc;
        }
      }
      return {
        videosGenerated: totalVideos,
        creditsUsed: totalCredits,
        byProvider,
        period: { start: start.toISOString(), end: end.toISOString() },
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure aggregating video usage.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  private mergeProvider(
    prior: Record<string, { count: number; credits: number }> | null | undefined,
    provider: string,
    creditsConsumed: number,
  ): Record<string, { count: number; credits: number }> {
    const next: Record<string, { count: number; credits: number }> = {};
    if (prior) {
      for (const [k, v] of Object.entries(prior)) {
        next[k] = { count: v.count ?? 0, credits: v.credits ?? 0 };
      }
    }
    const acc = next[provider] ?? { count: 0, credits: 0 };
    acc.count += 1;
    acc.credits += creditsConsumed;
    next[provider] = acc;
    return next;
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

/** Build the canonical {@link VideoUsageService}. */
export function createVideoUsageService(): VideoUsageService {
  return new VideoUsageService(createSupabaseAdminClient());
}

/** Internal: by_provider column path. Exposed for tests/typing only. */
export const BY_PROVIDER_COLUMN = BY_PROVIDER_PATH;
