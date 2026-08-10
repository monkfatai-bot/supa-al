"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { verifyWorkspaceMembership } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { syncEngine } from "./engine";
import type {
  SyncJob,
  SyncConflict,
  SyncHistoryEntry,
  SyncSchedule,
  SyncJobStatus,
  ConflictResolutionType,
  SyncCredentials,
  CompleteSyncJobResult,
  CreateSyncJobParams,
  ListSyncJobsParams,
  ScheduleSyncParams,
  PaginatedResult,
  SyncStats,
  ServiceResult,
} from "./types";

// ─── Zod schemas ──────────────────────────────────────────────────

const createSyncJobSchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().uuid().optional(),
  syncType: z.enum(["full", "incremental"]).default("full"),
  direction: z.enum(["inbound", "outbound", "bidirectional"]).default("inbound"),
  sourceEntity: z.string().min(1),
  targetEntity: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const scheduleSyncSchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().uuid(),
  syncType: z.enum(["full", "incremental"]).default("incremental"),
  cronExpression: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const resolveConflictSchema = z.object({
  conflictId: z.string().uuid(),
  resolution: z.enum([
    "auto_merged",
    "manual",
    "conflict_pending",
    "source_wins",
    "target_wins",
  ]),
  resolvedBy: z.string().uuid().optional(),
});

const paginationSchema = z.object({
  limit: z.number().int().min(1).max(200).default(20),
  offset: z.number().int().min(0).default(0),
});

// ─── Internal: credential fetcher ─────────────────────────────────

async function getCredentialsForIntegration(
  integrationId: string
): Promise<SyncCredentials> {
  const db = createServiceClient();

  // Try OAuth tokens first
  const { data: token } = await db
    .from("oauth_tokens")
    .select("access_token, refresh_token")
    .eq("account_id", integrationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (token?.access_token) {
    return {
      accessToken: token.access_token as string,
      refreshToken: token.refresh_token as string | undefined,
    };
  }

  // Fallback: check API keys
  const { data: apiKey } = await db
    .from("api_keys")
    .select("key_value")
    .eq("account_id", integrationId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (apiKey?.key_value) {
    return { apiKey: apiKey.key_value as string };
  }

  throw new Error(`No valid credentials found for integration ${integrationId}`);
}

// ─── Internal: log to integration_logs ────────────────────────────

async function logSyncActivity(
  workspaceId: string,
  integrationId: string | null,
  action: string,
  status: "success" | "error",
  error?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("integration_logs").insert({
      workspace_id: workspaceId,
      integration_id: integrationId,
      action,
      direction: "outbound",
      status,
      error_message: error ?? null,
      request: metadata ?? null,
    });
  } catch (err) {
    logger.error("Failed to write sync activity log", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Public server actions
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a new sync job in pending state.
 */
export async function createSyncJob(
  params: CreateSyncJobParams
): Promise<ServiceResult<SyncJob>> {
  try {
    const profile = await requireAuth();
    const parsed = createSyncJobSchema.parse(params);
    await verifyWorkspaceMembership(parsed.workspaceId, profile.id);

    const db = createServiceClient();
    const { data, error } = await db
      .from("integration_sync_jobs")
      .insert({
        workspace_id: parsed.workspaceId,
        integration_id: parsed.integrationId ?? null,
        sync_type: parsed.syncType,
        direction: parsed.direction,
        status: "pending",
        source_entity: parsed.sourceEntity,
        target_entity: parsed.targetEntity,
        config: parsed.config,
      })
      .select()
      .single();

    if (error) {
      logger.error("createSyncJob failed", { reason: error.message });
      return { success: false, message: "Failed to create sync job", error: error.message };
    }

    await logSyncActivity(
      parsed.workspaceId,
      parsed.integrationId ?? null,
      "sync_job_created",
      "success",
      undefined,
      { jobId: data.id }
    );

    return { success: true, message: "Sync job created", data: data as SyncJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("createSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Transition a pending job to running and dispatch to the engine.
 */
export async function startSyncJob(
  jobId: string
): Promise<ServiceResult<SyncJob>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    // Fetch job and verify workspace access
    const { data: job, error: fetchError } = await db
      .from("integration_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchError || !job) {
      return { success: false, message: "Sync job not found", error: fetchError?.message };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    if (job.status !== "pending") {
      return { success: false, message: `Cannot start job in '${job.status}' state` };
    }

    // Set status to running
    const { data: updated, error: updateError } = await db
      .from("integration_sync_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      logger.error("startSyncJob update failed", { reason: updateError.message });
      return { success: false, message: "Failed to start sync job", error: updateError.message };
    }

    // Dispatch to engine (fire-and-forget — the engine updates the job on completion)
    syncEngine
      .executeJob(updated as SyncJob, getCredentialsForIntegration)
      .then((result) => {
        // Use a dynamic import to avoid circular dependency at module level
        import("./actions").then((mod) => {
          mod.completeSyncJob(jobId, result).catch((e) =>
            logger.error("Auto-complete failed", {
              jobId,
              error: e instanceof Error ? e.message : String(e),
            })
          );
        });
      })
      .catch((err) => {
        import("./actions").then((mod) => {
          mod.failSyncJob(jobId, err instanceof Error ? err.message : String(err)).catch((e) =>
            logger.error("Auto-fail failed", {
              jobId,
              error: e instanceof Error ? e.message : String(e),
            })
          );
        });
      });

    return { success: true, message: "Sync job started", data: updated as SyncJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("startSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Mark a running job as completed with stats.
 */
export async function completeSyncJob(
  jobId: string,
  result: CompleteSyncJobResult
): Promise<ServiceResult<SyncJob>> {
  try {
    const db = createServiceClient();

    // Update cursor if incremental
    const { data: existing } = await db
      .from("integration_sync_jobs")
      .select("workspace_id, integration_id, sync_type, last_sync_cursor, config")
      .eq("id", jobId)
      .single();

    const { data: updated, error } = await db
      .from("integration_sync_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
        config: {
          ...(existing?.config ?? {}),
          _lastResult: result,
        },
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) {
      logger.error("completeSyncJob failed", { reason: error.message });
      return { success: false, message: "Failed to complete sync job", error: error.message };
    }

    if (existing) {
      await logSyncActivity(
        existing.workspace_id as string,
        existing.integration_id as string | null,
        "sync_job_completed",
        "success",
        undefined,
        { jobId, ...result }
      );
    }

    return { success: true, message: "Sync job completed", data: updated as SyncJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("completeSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Mark a running job as failed, increment retry, and schedule retry if allowed.
 */
export async function failSyncJob(
  jobId: string,
  error: string
): Promise<ServiceResult<SyncJob>> {
  try {
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    const newRetryCount = (job.retry_count as number) + 1;
    const retryLimit = (job.config as Record<string, unknown>).retryLimit as number ?? 3;
    const retryDelayMs = (job.config as Record<string, unknown>).retryDelayMs as number ?? 5000;

    const shouldRetry = newRetryCount < retryLimit;
    const nextRunAt = shouldRetry
      ? new Date(Date.now() + retryDelayMs * newRetryCount).toISOString()
      : null;

    const { data: updated, error: updateError } = await db
      .from("integration_sync_jobs")
      .update({
        status: shouldRetry ? "pending" : "failed",
        error_message: error,
        retry_count: newRetryCount,
        completed_at: shouldRetry ? null : new Date().toISOString(),
        next_run_at: nextRunAt,
      })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      logger.error("failSyncJob failed", { reason: updateError.message });
      return { success: false, message: "Failed to fail sync job", error: updateError.message };
    }

    await logSyncActivity(
      job.workspace_id as string,
      job.integration_id as string | null,
      "sync_job_failed",
      "error",
      error,
      { jobId, retryCount: newRetryCount, willRetry: shouldRetry }
    );

    logger.info("Sync job failed", {
      jobId,
      retryCount: newRetryCount,
      willRetry: shouldRetry,
    });

    return {
      success: true,
      message: shouldRetry
        ? `Sync job failed, retry ${newRetryCount}/${retryLimit} scheduled`
        : "Sync job failed permanently",
      data: updated as SyncJob,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("failSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Cancel a pending or running sync job.
 */
export async function cancelSyncJob(
  jobId: string
): Promise<ServiceResult<SyncJob>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    if (job.status === "completed" || job.status === "cancelled") {
      return { success: false, message: `Cannot cancel job in '${job.status}' state` };
    }

    const { data: updated, error } = await db
      .from("integration_sync_jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to cancel sync job", error: error.message };
    }

    return { success: true, message: "Sync job cancelled", data: updated as SyncJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("cancelSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * List sync jobs for a workspace with optional filters.
 */
export async function listSyncJobs(
  params: ListSyncJobsParams
): Promise<ServiceResult<PaginatedResult<SyncJob>>> {
  try {
    const profile = await requireAuth();
    await verifyWorkspaceMembership(params.workspaceId, profile.id);

    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    const db = createServiceClient();

    let countQuery = db
      .from("integration_sync_jobs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", params.workspaceId);

    let dataQuery = db
      .from("integration_sync_jobs")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) {
      countQuery = countQuery.eq("status", params.status);
      dataQuery = dataQuery.eq("status", params.status);
    }
    if (params.syncType) {
      countQuery = countQuery.eq("sync_type", params.syncType);
      dataQuery = dataQuery.eq("sync_type", params.syncType);
    }
    if (params.direction) {
      countQuery = countQuery.eq("direction", params.direction);
      dataQuery = dataQuery.eq("direction", params.direction);
    }
    if (params.integrationId) {
      countQuery = countQuery.eq("integration_id", params.integrationId);
      dataQuery = dataQuery.eq("integration_id", params.integrationId);
    }

    const { count } = await countQuery;
    const { data, error } = await dataQuery;

    if (error) {
      return { success: false, message: "Failed to list sync jobs", error: error.message };
    }

    return {
      success: true,
      message: "Sync jobs listed",
      data: {
        data: (data ?? []) as SyncJob[],
        total: count ?? 0,
        limit,
        offset,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("listSyncJobs", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Get a single sync job with its history entries.
 */
export async function getSyncJob(
  jobId: string
): Promise<ServiceResult<SyncJob & { history: SyncHistoryEntry[] }>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job, error } = await db
      .from("integration_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error || !job) {
      return { success: false, message: "Sync job not found", error: error?.message };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    const { data: history } = await db
      .from("integration_sync_history")
      .select("*")
      .eq("sync_job_id", jobId)
      .order("created_at", { ascending: true });

    return {
      success: true,
      message: "Sync job retrieved",
      data: {
        ...(job as SyncJob),
        history: (history ?? []) as SyncHistoryEntry[],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("getSyncJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Create and immediately start a sync job.
 */
export async function runSyncNow(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<SyncJob>> {
  const created = await createSyncJob({
    workspaceId,
    integrationId,
    sourceEntity: "external",
    targetEntity: "local",
    syncType: "incremental",
    direction: "inbound",
  });

  if (!created.success || !created.data) {
    return created;
  }

  return startSyncJob(created.data.id);
}

/**
 * Create or update a sync schedule for an integration.
 */
export async function scheduleSync(
  params: ScheduleSyncParams
): Promise<ServiceResult<SyncSchedule>> {
  try {
    const profile = await requireAuth();
    const parsed = scheduleSyncSchema.parse(params);
    await verifyWorkspaceMembership(parsed.workspaceId, profile.id);

    const db = createServiceClient();

    // Check if a schedule already exists for this workspace + integration
    const { data: existing } = await db
      .from("integration_sync_schedules")
      .select("*")
      .eq("workspace_id", parsed.workspaceId)
      .eq("integration_id", parsed.integrationId)
      .single();

    if (existing) {
      // Update existing
      const { data, error } = await db
        .from("integration_sync_schedules")
        .update({
          sync_type: parsed.syncType,
          cron_expression: parsed.cronExpression,
          config: parsed.config,
          enabled: true,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return { success: false, message: "Failed to update schedule", error: error.message };
      }

      return { success: true, message: "Schedule updated", data: data as SyncSchedule };
    }

    // Create new schedule
    const { data, error } = await db
      .from("integration_sync_schedules")
      .insert({
        workspace_id: parsed.workspaceId,
        integration_id: parsed.integrationId,
        sync_type: parsed.syncType,
        cron_expression: parsed.cronExpression,
        config: parsed.config,
      })
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to create schedule", error: error.message };
    }

    return { success: true, message: "Schedule created", data: data as SyncSchedule };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("scheduleSync", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * List all sync schedules for a workspace.
 */
export async function listSyncSchedules(
  workspaceId: string
): Promise<ServiceResult<SyncSchedule[]>> {
  try {
    const profile = await requireAuth();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const db = createServiceClient();
    const { data, error } = await db
      .from("integration_sync_schedules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      return { success: false, message: "Failed to list schedules", error: error.message };
    }

    return {
      success: true,
      message: "Schedules listed",
      data: (data ?? []) as SyncSchedule[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("listSyncSchedules", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Delete a sync schedule.
 */
export async function deleteSyncSchedule(
  scheduleId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    // Fetch to get workspace_id for membership check
    const { data: schedule } = await db
      .from("integration_sync_schedules")
      .select("workspace_id")
      .eq("id", scheduleId)
      .single();

    if (!schedule) {
      return { success: false, message: "Schedule not found" };
    }

    await verifyWorkspaceMembership(schedule.workspace_id as string, profile.id);

    const { error } = await db
      .from("integration_sync_schedules")
      .delete()
      .eq("id", scheduleId);

    if (error) {
      return { success: false, message: "Failed to delete schedule", error: error.message };
    }

    return { success: true, message: "Schedule deleted" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("deleteSyncSchedule", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Detect and store conflicts for a completed sync job.
 */
export async function detectConflicts(
  jobId: string
): Promise<ServiceResult<SyncConflict[]>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("workspace_id, status")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    // Fetch any unresolved conflicts
    const { data, error } = await db
      .from("integration_sync_conflicts")
      .select("*")
      .eq("sync_job_id", jobId)
      .eq("resolution", "conflict_pending");

    if (error) {
      return { success: false, message: "Failed to detect conflicts", error: error.message };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} pending conflicts`,
      data: (data ?? []) as SyncConflict[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("detectConflicts", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Resolve a specific conflict.
 */
export async function resolveConflict(
  conflictId: string,
  resolution: ConflictResolutionType,
  resolvedBy?: string
): Promise<ServiceResult<SyncConflict>> {
  try {
    const parsed = resolveConflictSchema.parse({ conflictId, resolution, resolvedBy });
    const profile = await requireAuth();
    const db = createServiceClient();

    // Fetch conflict to get job → workspace for auth check
    const { data: conflict } = await db
      .from("integration_sync_conflicts")
      .select("sync_job_id")
      .eq("id", parsed.conflictId)
      .single();

    if (!conflict) {
      return { success: false, message: "Conflict not found" };
    }

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("workspace_id")
      .eq("id", conflict.sync_job_id)
      .single();

    if (job) {
      await verifyWorkspaceMembership(job.workspace_id as string, profile.id);
    }

    const { data, error } = await db
      .from("integration_sync_conflicts")
      .update({
        resolution: parsed.resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: parsed.resolvedBy ?? profile.id,
      })
      .eq("id", parsed.conflictId)
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to resolve conflict", error: error.message };
    }

    return { success: true, message: "Conflict resolved", data: data as SyncConflict };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("resolveConflict", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * List conflicts for a sync job, optionally filtered by resolution status.
 */
export async function listConflicts(
  jobId: string,
  status?: ConflictResolutionType
): Promise<ServiceResult<SyncConflict[]>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    let query = db
      .from("integration_sync_conflicts")
      .select("*")
      .eq("sync_job_id", jobId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("resolution", status);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, message: "Failed to list conflicts", error: error.message };
    }

    return {
      success: true,
      message: "Conflicts listed",
      data: (data ?? []) as SyncConflict[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("listConflicts", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Get paginated history entries for a sync job.
 */
export async function getSyncHistory(
  jobId: string,
  pagination?: { limit?: number; offset?: number }
): Promise<ServiceResult<PaginatedResult<SyncHistoryEntry>>> {
  try {
    const parsed = paginationSchema.parse(pagination ?? {});
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    const { count } = await db
      .from("integration_sync_history")
      .select("*", { count: "exact", head: true })
      .eq("sync_job_id", jobId);

    const { data, error } = await db
      .from("integration_sync_history")
      .select("*")
      .eq("sync_job_id", jobId)
      .order("created_at", { ascending: false })
      .range(parsed.offset, parsed.offset + parsed.limit - 1);

    if (error) {
      return { success: false, message: "Failed to get sync history", error: error.message };
    }

    return {
      success: true,
      message: "Sync history retrieved",
      data: {
        data: (data ?? []) as SyncHistoryEntry[],
        total: count ?? 0,
        limit: parsed.limit,
        offset: parsed.offset,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("getSyncHistory", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Aggregate stats for a workspace's sync jobs.
 */
export async function getSyncStats(
  workspaceId: string
): Promise<ServiceResult<SyncStats>> {
  try {
    const profile = await requireAuth();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const db = createServiceClient();

    // Total jobs by status
    const { data: statusCounts } = await db
      .from("integration_sync_jobs")
      .select("status")
      .eq("workspace_id", workspaceId);

    // Average duration for completed jobs
    const { data: completedJobs } = await db
      .from("integration_sync_jobs")
      .select("started_at, completed_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "completed");

    // Pending conflicts
    const { count: pendingConflicts } = await db
      .from("integration_sync_conflicts")
      .select("*", { count: "exact", head: true })
      .eq("resolution", "conflict_pending");

    // Active schedules
    const { count: activeSchedules } = await db
      .from("integration_sync_schedules")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("enabled", true);

    const counts = (statusCounts ?? []).reduce(
      (acc, row) => {
        acc[row.status as SyncJobStatus] = (acc[row.status as SyncJobStatus] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const totalJobs = statusCounts?.length ?? 0;
    const completedJobsCount = counts["completed"] ?? 0;
    const successRate = totalJobs > 0 ? completedJobsCount / totalJobs : 0;

    // Calculate average duration
    let avgDurationMs: number | null = null;
    if (completedJobs && completedJobs.length > 0) {
      const durations = completedJobs
        .filter((j) => j.started_at && j.completed_at)
        .map(
          (j) =>
            new Date(j.completed_at as string).getTime() -
            new Date(j.started_at as string).getTime()
        );
      if (durations.length > 0) {
        avgDurationMs = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      }
    }

    const stats: SyncStats = {
      totalJobs,
      completedJobs: completedJobsCount,
      failedJobs: counts["failed"] ?? 0,
      pendingJobs: counts["pending"] ?? 0,
      runningJobs: counts["running"] ?? 0,
      successRate: Math.round(successRate * 100) / 100,
      avgDurationMs,
      pendingConflicts: pendingConflicts ?? 0,
      activeSchedules: activeSchedules ?? 0,
    };

    return { success: true, message: "Sync stats retrieved", data: stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("getSyncStats", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Reset a failed job to pending so it can be retried.
 */
export async function retryFailedJob(
  jobId: string
): Promise<ServiceResult<SyncJob>> {
  try {
    const profile = await requireAuth();
    const db = createServiceClient();

    const { data: job } = await db
      .from("integration_sync_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) {
      return { success: false, message: "Sync job not found" };
    }

    await verifyWorkspaceMembership(job.workspace_id as string, profile.id);

    if (job.status !== "failed") {
      return { success: false, message: `Can only retry failed jobs, current status: '${job.status}'` };
    }

    const { data: updated, error } = await db
      .from("integration_sync_jobs")
      .update({
        status: "pending",
        error_message: null,
        completed_at: null,
        started_at: null,
      })
      .eq("id", jobId)
      .select()
      .single();

    if (error) {
      return { success: false, message: "Failed to retry job", error: error.message };
    }

    return { success: true, message: "Job queued for retry", data: updated as SyncJob };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("retryFailedJob", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Disable a sync schedule (pause).
 */
export async function pauseSync(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<SyncSchedule>> {
  try {
    const profile = await requireAuth();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const db = createServiceClient();
    const { data, error } = await db
      .from("integration_sync_schedules")
      .update({ enabled: false })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: "Schedule not found", error: error?.message };
    }

    return { success: true, message: "Sync paused", data: data as SyncSchedule };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("pauseSync", { error: message });
    return { success: false, message, error: message };
  }
}

/**
 * Enable a sync schedule (resume).
 */
export async function resumeSync(
  workspaceId: string,
  integrationId: string
): Promise<ServiceResult<SyncSchedule>> {
  try {
    const profile = await requireAuth();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const db = createServiceClient();
    const { data, error } = await db
      .from("integration_sync_schedules")
      .update({ enabled: true })
      .eq("workspace_id", workspaceId)
      .eq("integration_id", integrationId)
      .select()
      .single();

    if (error || !data) {
      return { success: false, message: "Schedule not found", error: error?.message };
    }

    return { success: true, message: "Sync resumed", data: data as SyncSchedule };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("resumeSync", { error: message });
    return { success: false, message, error: message };
  }
}
