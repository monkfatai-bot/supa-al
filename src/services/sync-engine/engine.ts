/**
 * Sync Engine — core orchestration (pure module, no "use server").
 * Handles the full lifecycle of a sync job: fetch → compare → apply → detect → record.
 */

import { createServiceClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import type {
  SyncJob,
  SyncCredentials,
  SourceRecord,
  SyncChange,
  ConflictRecord,
  SyncEngineConfig,
  ConflictResolutionStrategy,
  SyncHistoryAction,
} from "./types";

// ─── Default configuration ─────────────────────────────────────

const DEFAULT_CONFIG: SyncEngineConfig = {
  maxConcurrentJobs: 3,
  retryLimit: 3,
  retryDelayMs: 5000,
  batchSize: 100,
  conflictResolution: "auto_source_wins",
  offlineQueueEnabled: true,
};

// ─── Result returned from a completed engine execution ─────────

export interface EngineResult {
  recordsProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflictsDetected: number;
  durationMs: number;
}

export type GetCredentialsFn = (integrationId: string) => Promise<SyncCredentials>;

// ─── SyncEngine class ──────────────────────────────────────────

class SyncEngine {
  private config: SyncEngineConfig;

  constructor(config?: Partial<SyncEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a sync job end-to-end.
   * 1. Fetch source data (with cursor if incremental)
   * 2. Fetch target data for comparison
   * 3. Diff records to produce a set of changes
   * 4. Detect conflicts
   * 5. Apply changes to target
   * 6. Record history entries
   * 7. Return aggregated result
   */
  async executeJob(
    job: SyncJob,
    getCredentials: GetCredentialsFn
  ): Promise<EngineResult> {
    const startTime = Date.now();
    const db = createServiceClient();

    let credentials: SyncCredentials = {};
    try {
      if (job.integration_id) {
        credentials = await getCredentials(job.integration_id);
      }
    } catch (err) {
      logger.error("Failed to retrieve credentials for sync job", {
        jobId: job.id,
        integrationId: job.integration_id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error(
        `Could not retrieve credentials: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 1. Fetch source records
    const sourceRecords = await this.fetchSourceData(
      credentials,
      job.config as Record<string, unknown>,
      job.last_sync_cursor
    );

    // 2. Fetch existing target records (from our DB)
    const targetRecords = await this.fetchTargetRecords(
      db,
      job.target_entity,
      job.workspace_id
    );

    // 3. Compute diff
    const changes = this.computeDiff(
      sourceRecords,
      targetRecords,
      job.sync_type,
      job.direction
    );

    // 4. Detect conflicts (only for bidirectional or update ops)
    const conflicts =
      job.direction === "bidirectional"
        ? this.detectConflicts(sourceRecords, targetRecords)
        : [];

    // 5. Store conflicts
    if (conflicts.length > 0) {
      await this.storeConflicts(db, job.id, conflicts);
    }

    // 6. Apply non-conflicting changes
    const appliedChanges = this.filterNonConflictingChanges(changes, conflicts);
    await this.applyChanges(db, appliedChanges, job.target_entity, job.workspace_id);

    // 7. Record history
    await this.recordHistory(db, job, appliedChanges, startTime);

    const durationMs = Date.now() - startTime;

    return {
      recordsProcessed: sourceRecords.length,
      created: changes.filter((c) => c.action === "created").length,
      updated: changes.filter((c) => c.action === "updated").length,
      deleted: changes.filter((c) => c.action === "deleted").length,
      skipped: changes.filter((c) => c.action === "skipped").length,
      conflictsDetected: conflicts.length,
      durationMs,
    };
  }

  /**
   * Fetch records from the external source API using cursor-based
   * pagination. The real implementation will vary per integration;
   * this provides a generic skeleton that calls the source endpoint.
   */
  async fetchSourceData(
    credentials: SyncCredentials,
    config: Record<string, unknown>,
    cursor?: string | null
  ): Promise<SourceRecord[]> {
    const baseUrl = credentials.baseUrl ?? (config.baseUrl as string) ?? "";
    const entityEndpoint = (config.sourceEndpoint as string) ?? "";
    const url = `${baseUrl}${entityEndpoint}`;

    if (!url) {
      logger.warn("No source URL configured for sync fetch");
      return [];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (credentials.accessToken) {
      headers["Authorization"] = `Bearer ${credentials.accessToken}`;
    } else if (credentials.apiKey) {
      headers["X-API-Key"] = credentials.apiKey;
    }

    const queryParams = new URLSearchParams();
    if (cursor) {
      queryParams.set("cursor", cursor);
    }
    const pageSize = (config.pageSize as number) ?? this.config.batchSize;
    queryParams.set("limit", String(pageSize));

    const fullUrl = `${url}?${queryParams.toString()}`;

    try {
      const response = await fetch(fullUrl, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`Source API returned ${response.status}: ${response.statusText}`);
      }

      const body = await response.json();
      // Support both { data: [...] } and plain array responses
      const records: SourceRecord[] = Array.isArray(body)
        ? body
        : Array.isArray(body.data)
          ? body.data
          : body.records
            ? body.records
            : [];

      return records;
    } catch (err) {
      logger.error("Failed to fetch source data", {
        url: fullUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Apply a set of changes (create / update / delete) to the target.
   */
  async applyChanges(
    targetClient: ReturnType<typeof createServiceClient>,
    changes: SyncChange[],
    targetEntity: string,
    workspaceId: string
  ): Promise<void> {
    const creates = changes.filter((c) => c.action === "created");
    const updates = changes.filter((c) => c.action === "updated");
    const deletes = changes.filter((c) => c.action === "deleted");

    // Batch inserts
    if (creates.length > 0) {
      const rows = creates.map((c) => ({
        ...c.data,
        workspace_id: workspaceId,
      }));
      const { error } = await targetClient
        .from(targetEntity)
        .upsert(rows, { onConflict: "id" });
      if (error) {
        logger.error("Batch create failed during sync", {
          entity: targetEntity,
          count: creates.length,
          reason: error.message,
        });
        throw new Error(`Batch create failed: ${error.message}`);
      }
    }

    // Batch updates
    if (updates.length > 0) {
      for (const change of updates) {
        const { id, ...fields } = change.data;
        const { error } = await targetClient
          .from(targetEntity)
          .update(fields)
          .eq("id", id)
          .eq("workspace_id", workspaceId);
        if (error) {
          logger.error("Update failed during sync", {
            entity: targetEntity,
            entityId: id,
            reason: error.message,
          });
          // Continue with other updates — don't abort the whole batch
        }
      }
    }

    // Batch deletes
    if (deletes.length > 0) {
      const ids = deletes.map((c) => c.entityId);
      const { error } = await targetClient
        .from(targetEntity)
        .delete()
        .in("id", ids)
        .eq("workspace_id", workspaceId);
      if (error) {
        logger.error("Batch delete failed during sync", {
          entity: targetEntity,
          count: ids.length,
          reason: error.message,
        });
        throw new Error(`Batch delete failed: ${error.message}`);
      }
    }
  }

  /**
   * Compare source and target records to find conflicts.
   * A conflict exists when both sides have modified the same field
   * since the last sync.
   */
  detectConflicts(
    sourceRecords: SourceRecord[],
    targetRecords: SourceRecord[]
  ): ConflictRecord[] {
    const conflicts: ConflictRecord[] = [];
    const targetMap = new Map<string, SourceRecord>();

    for (const rec of targetRecords) {
      targetMap.set(rec.id, rec);
    }

    for (const source of sourceRecords) {
      const target = targetMap.get(source.id);
      if (!target) continue; // New record, not a conflict

      // Check each field for divergence
      const sourceKeys = Object.keys(source).filter((k) => k !== "id");
      for (const key of sourceKeys) {
        if (
          JSON.stringify(source[key]) !== JSON.stringify(target[key])
        ) {
          conflicts.push({
            entityType: (source as Record<string, unknown>)["_type"] as string ?? "unknown",
            entityId: source.id,
            fieldName: key,
            sourceValue: source[key],
            targetValue: target[key],
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Apply a resolution strategy to a single conflict.
   */
  resolveConflict(
    conflict: ConflictRecord,
    strategy: ConflictResolutionStrategy
  ): { value: unknown; resolved: boolean } {
    switch (strategy) {
      case "auto_source_wins":
        return { value: conflict.sourceValue, resolved: true };
      case "auto_target_wins":
        return { value: conflict.targetValue, resolved: true };
      case "manual":
      default:
        return { value: conflict.targetValue, resolved: false };
    }
  }

  /**
   * Calculate the next cursor from a page of fetched records.
   * Uses the last record's `id` (or `updated_at` if present) as cursor.
   */
  calculateNextCursor(records: SourceRecord[]): string | null {
    if (records.length === 0) return null;

    const last = records[records.length - 1];
    // Prefer an explicit cursor/updated_at field
    if (last.updated_at) {
      return String(last.updated_at);
    }
    if ((last as Record<string, unknown>).cursor) {
      return String((last as Record<string, unknown>).cursor);
    }
    return last.id;
  }

  /**
   * Determine whether a failed job should be retried.
   */
  shouldRetry(job: SyncJob): boolean {
    return job.retry_count < this.config.retryLimit;
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async fetchTargetRecords(
    db: ReturnType<typeof createServiceClient>,
    targetEntity: string,
    workspaceId: string
  ): Promise<SourceRecord[]> {
    const { data, error } = await db
      .from(targetEntity)
      .select("*")
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to fetch target records", {
        entity: targetEntity,
        workspaceId,
        reason: error.message,
      });
      throw new Error(`Target fetch failed: ${error.message}`);
    }

    return (data ?? []) as SourceRecord[];
  }

  private computeDiff(
    sourceRecords: SourceRecord[],
    targetRecords: SourceRecord[],
    _syncType: string,
    direction: string
  ): SyncChange[] {
    const changes: SyncChange[] = [];
    const targetMap = new Map<string, SourceRecord>();

    for (const rec of targetRecords) {
      targetMap.set(rec.id, rec);
    }
    const sourceIds = new Set(sourceRecords.map((r) => r.id));

    // For outbound: source is local DB, target is external
    // For inbound: source is external, target is local DB
    const sourceSystem = direction === "outbound" ? "local" : "external";
    const targetSystem = direction === "outbound" ? "external" : "local";

    for (const source of sourceRecords) {
      const target = targetMap.get(source.id);

      if (!target) {
        changes.push({
          action: "created",
          entityType: (source as Record<string, unknown>)["_type"] as string ?? "unknown",
          entityId: source.id,
          data: { ...source, _source_system: sourceSystem, _target_system: targetSystem },
        });
      } else if (JSON.stringify(source) !== JSON.stringify(target)) {
        changes.push({
          action: "updated",
          entityType: (source as Record<string, unknown>)["_type"] as string ?? "unknown",
          entityId: source.id,
          data: { ...source, _source_system: sourceSystem, _target_system: targetSystem },
        });
      } else {
        changes.push({
          action: "skipped",
          entityType: (source as Record<string, unknown>)["_type"] as string ?? "unknown",
          entityId: source.id,
          data: { id: source.id, _source_system: sourceSystem, _target_system: targetSystem },
        });
      }
    }

    // Records in target but not in source → delete (inbound only)
    if (direction === "inbound") {
      for (const target of targetRecords) {
        if (!sourceIds.has(target.id)) {
          changes.push({
            action: "deleted",
            entityType: (target as Record<string, unknown>)["_type"] as string ?? "unknown",
            entityId: target.id,
            data: { id: target.id },
          });
        }
      }
    }

    return changes;
  }

  private filterNonConflictingChanges(
    changes: SyncChange[],
    conflicts: ConflictRecord[]
  ): SyncChange[] {
    if (conflicts.length === 0) return changes;

    const conflictKeys = new Set(
      conflicts.map((c) => `${c.entityId}:${c.fieldName}`)
    );

    return changes.filter((change) => {
      if (change.action !== "updated") return true;
      // Keep the change if none of its fields are conflicted
      const fields = Object.keys(change.data).filter((k) => !k.startsWith("_"));
      return !fields.some((f) => conflictKeys.has(`${change.entityId}:${f}`));
    });
  }

  private async storeConflicts(
    db: ReturnType<typeof createServiceClient>,
    jobId: string,
    conflicts: ConflictRecord[]
  ): Promise<void> {
    const rows = conflicts.map((c) => ({
      sync_job_id: jobId,
      entity_type: c.entityType,
      entity_id: c.entityId,
      field_name: c.fieldName,
      source_value: c.sourceValue ?? null,
      target_value: c.targetValue ?? null,
      resolution: "conflict_pending" as const,
    }));

    // Insert in batches to avoid payload limits
    const batchSize = this.config.batchSize;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await db
        .from("integration_sync_conflicts")
        .insert(batch);
      if (error) {
        logger.error("Failed to store sync conflicts", {
          jobId,
          reason: error.message,
        });
      }
    }
  }

  private async recordHistory(
    db: ReturnType<typeof createServiceClient>,
    job: SyncJob,
    changes: SyncChange[],
    startTime: number
  ): Promise<void> {
    const durationMs = Date.now() - startTime;

    // Group by action for a summary entry
    const actionCounts = new Map<SyncHistoryAction, number>();
    for (const change of changes) {
      actionCounts.set(change.action, (actionCounts.get(change.action) ?? 0) + 1);
    }

    const historyRows = changes.map((change) => ({
      sync_job_id: job.id,
      entity_type: change.entityType,
      entity_id: change.entityId,
      action: change.action,
      source_system: (change.data._source_system as string) ?? "unknown",
      target_system: (change.data._target_system as string) ?? "unknown",
      duration_ms: change.action === "skipped" ? null : durationMs,
      record_count: 1,
      metadata: { action_counts: Object.fromEntries(actionCounts) },
    }));

    if (historyRows.length > 0) {
      const batchSize = this.config.batchSize;
      for (let i = 0; i < historyRows.length; i += batchSize) {
        const batch = historyRows.slice(i, i + batchSize);
        const { error } = await db
          .from("integration_sync_history")
          .insert(batch);
        if (error) {
          logger.error("Failed to record sync history", {
            jobId: job.id,
            reason: error.message,
          });
        }
      }
    }
  }
}

/** Singleton engine instance */
export const syncEngine = new SyncEngine();
