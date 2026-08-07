/**
 * Supa AI — Phase 10 Integration Hub — Sync Engine.
 *
 * Server-only engine that runs sync jobs (pull / push / bidirectional)
 * between integrations and the Supa AI workspace. Each job is
 * represented by a row in `integration_sync_jobs`; the engine picks up
 * `pending` rows via `setImmediate` and walks them to completion.
 *
 * The actual record-transfer logic lives inside each connector's
 * `runSync` method (the base class default is a no-op that just marks
 * the job completed). For Phase 10 V1, the engine focuses on the
 * orchestration + bookkeeping; concrete record-sync is a follow-up.
 *
 * @module @/lib/integrations/sync-engine
 */
import "server-only";

import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/types";

import { connectorRegistry } from "./connectors/registry";
import { computeRetryDelay, toDbError, wrapIntegrationError } from "./core";
import { IntegrationEvents, eventBus } from "./event-bus";
import type {
  CreateSyncJobInput,
  IntegrationEvent,
  IntegrationSyncJob,
  SyncDirection,
  SyncJobStatus,
  SyncJobType,
  SyncStats,
  SyncTrigger,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;
const RETRY_BATCH_SIZE = 25;
const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// SyncEngine
// ---------------------------------------------------------------------------

/**
 * Server-only sync engine. Construct via {@link getSyncEngine}
 * (singleton) or {@link getSyncEngineWith} (DI for tests).
 */
export class SyncEngine {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Create a new sync job row + enqueue it for background processing.
   * Returns the created row.
   */
  async createJob(input: {
    workspaceId: string;
    userId: string;
    data: CreateSyncJobInput;
  }): Promise<IntegrationSyncJob> {
    try {
      const jobType: SyncJobType = input.data.jobType ?? "manual";
      const direction: SyncDirection = input.data.direction ?? "pull";
      const trigger: SyncTrigger = input.data.trigger ?? "manual";
      const maxRetries = input.data.maxRetries ?? DEFAULT_MAX_RETRIES;

      const row: TablesInsert<"integration_sync_jobs"> = {
        workspace_id: input.workspaceId,
        integration_id: input.data.integrationId,
        job_type: jobType,
        status: "pending",
        resource: input.data.resource ?? null,
        direction,
        trigger,
        max_retries: maxRetries,
        details: (input.data.details ?? {}) as unknown as TablesInsert<"integration_sync_jobs">["details"],
        created_by: input.userId,
      };
      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "syncEngine.createJob failed");
      if (!data) throw new Error("syncEngine.createJob returned no row.");
      const job = data as unknown as IntegrationSyncJob;

      // Enqueue for background processing.
      setImmediate(() => {
        void this.processJob(job.id);
      });

      return job;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure creating sync job.", {
        integrationId: input.data.integrationId,
      });
    }
  }

  /**
   * Process a single sync job: mark `running`, resolve the integration's
   * connector, call its (no-op default) sync routine, mark `completed`
   * or `failed` based on the outcome. Publishes a sync-completed or
   * sync-failed event.
   */
  async processJob(jobId: string): Promise<IntegrationSyncJob> {
    let job: IntegrationSyncJob;
    try {
      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId)
        .select()
        .single();
      if (error) throw toDbError(error, "syncEngine.processJob: start failed");
      if (!data) throw new Error("Sync job not found.");
      job = data as unknown as IntegrationSyncJob;
    } catch (err) {
      throw wrapIntegrationError(err, "Unexpected failure starting sync job.", { jobId });
    }

    // Resolve the integration's connector key.
    let connectorKey: string | null = null;
    let workspaceId: string | null = null;
    try {
      const { data: integration, error } = await this.supabase
        .from("integrations")
        .select("workspace_id, connector_key")
        .eq("id", job.integration_id)
        .maybeSingle();
      if (error) throw toDbError(error, "syncEngine.processJob: lookup integration failed");
      const row = integration as unknown as { workspace_id: string; connector_key: string } | null;
      if (!row) throw new Error("Integration not found for sync job.");
      connectorKey = row.connector_key;
      workspaceId = row.workspace_id;
    } catch (err) {
      await this.markFailed(jobId, err);
      throw err;
    }

    // Run the connector's sync routine (no-op default for V1).
    try {
      const connector = connectorKey
        ? connectorRegistry.has(connectorKey)
          ? connectorRegistry.get(connectorKey)
          : null
        : null;

      let recordsTotal = 0;
      let recordsSynced = 0;
      if (connector && typeof (connector as { runSync?: () => Promise<{ total: number; synced: number }> }).runSync === "function") {
        const result = await (connector as unknown as { runSync: () => Promise<{ total: number; synced: number }> }).runSync();
        recordsTotal = result.total;
        recordsSynced = result.synced;
      } else {
        // No-op sync — record a single successful no-op.
        recordsTotal = 0;
        recordsSynced = 0;
      }

      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .update({
          status: "completed",
          records_total: recordsTotal,
          records_synced: recordsSynced,
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId)
        .select()
        .single();
      if (error) throw toDbError(error, "syncEngine.processJob: complete failed");
      const completed = data as unknown as IntegrationSyncJob;

      if (workspaceId) {
        void eventBus.publish({
          workspaceId,
          source: "sync-engine",
          type: IntegrationEvents.integrationSyncCompleted,
          category: "integration",
          payload: {
            jobId,
            integrationId: job.integration_id,
            recordsSynced,
          } as Record<string, unknown>,
        });
      }

      return completed;
    } catch (err) {
      await this.markFailed(jobId, err);
      if (workspaceId) {
        void eventBus.publish({
          workspaceId,
          source: "sync-engine",
          type: IntegrationEvents.integrationSyncFailed,
          category: "integration",
          payload: {
            jobId,
            integrationId: job.integration_id,
            error: err instanceof Error ? err.message : String(err),
          } as Record<string, unknown>,
        });
      }
      throw wrapIntegrationError(err, "Sync job processing failed.", { jobId });
    }
  }

  /**
   * Cancel a pending or running job. Marks the row `cancelled`.
   */
  async cancelJob(jobId: string): Promise<IntegrationSyncJob> {
    try {
      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .update({
          status: "cancelled",
          completed_at: new Date().toISOString(),
        } as never)
        .eq("id", jobId)
        .in("status", ["pending", "running", "retrying"])
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "syncEngine.cancelJob failed");
      if (!data) throw new Error("Sync job not found or already completed.");
      return data as unknown as IntegrationSyncJob;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure cancelling sync job.", { jobId });
    }
  }

  /**
   * Retry a failed or cancelled job: bumps `retry_count`, resets the
   * status to `pending`, and re-enqueues it.
   */
  async retryJob(jobId: string): Promise<IntegrationSyncJob> {
    try {
      const { data: existing, error: lookupErr } = await this.supabase
        .from("integration_sync_jobs")
        .select("retry_count, max_retries")
        .eq("id", jobId)
        .maybeSingle();
      if (lookupErr) throw toDbError(lookupErr, "syncEngine.retryJob: lookup failed");
      const row = existing as unknown as { retry_count: number; max_retries: number } | null;
      if (!row) throw new Error("Sync job not found.");
      if (row.retry_count >= row.max_retries) {
        throw new Error("Max retries reached. Create a new job instead.");
      }

      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .update({
          status: "pending",
          retry_count: row.retry_count + 1,
          started_at: null,
          completed_at: null,
          next_retry_at: null,
          error: null,
        } as never)
        .eq("id", jobId)
        .select()
        .single();
      if (error) throw toDbError(error, "syncEngine.retryJob: update failed");
      const job = data as unknown as IntegrationSyncJob;

      setImmediate(() => {
        void this.processJob(job.id);
      });
      return job;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure retrying sync job.", { jobId });
    }
  }

  /**
   * Process the retry queue: fetch `retrying` jobs whose
   * `next_retry_at` has elapsed and re-process them. Returns the
   * number of jobs processed.
   */
  async processRetryQueue(): Promise<number> {
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await this.supabase
        .from("integration_sync_jobs")
        .select()
        .eq("status", "retrying")
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
        .order("created_at", { ascending: true })
        .limit(RETRY_BATCH_SIZE);
      if (error) throw toDbError(error, "syncEngine.processRetryQueue: fetch failed");
      if (!data || data.length === 0) return 0;

      let processed = 0;
      for (const row of data as unknown as IntegrationSyncJob[]) {
        try {
          await this.processJob(row.id);
          processed += 1;
        } catch (err) {
          logger.warn("syncEngine.processRetryQueue: job failed", {
            jobId: row.id,
            error: String(err),
          });
        }
      }
      return processed;
    } catch (err) {
      logger.warn("syncEngine.processRetryQueue failed", { error: String(err) });
      return 0;
    }
  }

  /**
   * Aggregate stats for a workspace: counts by status + total records
   * synced + the most recent N jobs.
   */
  async getStats(input: { workspaceId: string; recentLimit?: number }): Promise<SyncStats> {
    try {
      const recentLimit = Math.max(1, Math.min(input.recentLimit ?? 10, 50));
      const { data: rows, error } = await this.supabase
        .from("integration_sync_jobs")
        .select("id, status, records_synced, created_at")
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw toDbError(error, "syncEngine.getStats failed");

      const all = (rows ?? []) as unknown as Array<{
        id: string;
        status: SyncJobStatus;
        records_synced: number;
        created_at: string;
      }>;

      const summary: SyncStats = {
        total: all.length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        retrying: 0,
        totalRecordsSynced: 0,
        recent: [],
      };
      for (const r of all) {
        if (r.status === "pending") summary.pending += 1;
        else if (r.status === "running") summary.running += 1;
        else if (r.status === "completed") {
          summary.completed += 1;
          summary.totalRecordsSynced += r.records_synced ?? 0;
        } else if (r.status === "failed") summary.failed += 1;
        else if (r.status === "cancelled") summary.cancelled += 1;
        else if (r.status === "retrying") summary.retrying += 1;
      }

      const { data: recentRows, error: recentErr } = await this.supabase
        .from("integration_sync_jobs")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(0, recentLimit - 1);
      if (recentErr) throw toDbError(recentErr, "syncEngine.getStats: recent fetch failed");
      summary.recent = (recentRows ?? []) as unknown as IntegrationSyncJob[];

      return summary;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure fetching sync stats.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * List sync jobs for a workspace (newest first). Optional `status`
   * + `integrationId` filters.
   */
  async listJobs(input: {
    workspaceId: string;
    integrationId?: string;
    status?: SyncJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<IntegrationSyncJob[]> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, input.offset ?? 0);
    try {
      let query = this.supabase
        .from("integration_sync_jobs")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (input.integrationId) query = query.eq("integration_id", input.integrationId);
      if (input.status) query = query.eq("status", input.status);
      const { data, error } = await query;
      if (error) throw toDbError(error, "syncEngine.listJobs failed");
      return (data ?? []) as unknown as IntegrationSyncJob[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing sync jobs.");
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async markFailed(jobId: string, err: unknown): Promise<void> {
    try {
      const { data: row } = await this.supabase
        .from("integration_sync_jobs")
        .select("retry_count, max_retries")
        .eq("id", jobId)
        .maybeSingle();
      const d = row as unknown as { retry_count: number; max_retries: number } | null;
      const attempts = (d?.retry_count ?? 0);
      const max = (d?.max_retries ?? DEFAULT_MAX_RETRIES);

      const update: TablesUpdate<"integration_sync_jobs"> = {
        status: attempts + 1 < max ? "retrying" : "failed",
        error: err instanceof Error ? err.message : String(err),
        completed_at: attempts + 1 < max ? null : new Date().toISOString(),
      };
      if (attempts + 1 < max) {
        const delayMs = computeRetryDelay(attempts);
        update.next_retry_at = new Date(Date.now() + delayMs).toISOString();
      }
      await this.supabase
        .from("integration_sync_jobs")
        .update(update as never)
        .eq("id", jobId);
    } catch (markErr) {
      logger.warn("syncEngine.markFailed failed", { jobId, error: String(markErr) });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _engine: SyncEngine | null = null;

/** Get the shared sync engine (singleton). */
export function getSyncEngine(): SyncEngine {
  if (_engine) return _engine;
  _engine = new SyncEngine(createSupabaseAdminClient());
  return _engine;
}

/** Get a sync engine bound to a specific admin client (tests / DI). */
export function getSyncEngineWith(supabase: AdminSupabaseClient): SyncEngine {
  return new SyncEngine(supabase);
}
