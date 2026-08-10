/**
 * Sync Engine — TypeScript interfaces matching migration 015.
 */

import type { Json } from "@/types/generated/database";

// ─── Enums (mirror Postgres enums) ──────────────────────────────

export type SyncJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type SyncType = "full" | "incremental";

export type SyncDirection = "inbound" | "outbound" | "bidirectional";

export type SyncHistoryAction = "created" | "updated" | "deleted" | "skipped";

export type ConflictResolutionType =
  | "auto_merged"
  | "manual"
  | "conflict_pending"
  | "source_wins"
  | "target_wins";

// ─── Database row types ─────────────────────────────────────────

export interface SyncJob {
  id: string;
  workspace_id: string;
  integration_id: string | null;
  sync_type: SyncType;
  direction: SyncDirection;
  status: SyncJobStatus;
  source_entity: string;
  target_entity: string;
  started_at: string | null;
  completed_at: string | null;
  next_run_at: string | null;
  last_sync_cursor: string | null;
  error_message: string | null;
  retry_count: number;
  config: Json;
  created_at: string;
  updated_at: string;
}

export interface SyncConflict {
  id: string;
  sync_job_id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  source_value: Json | null;
  target_value: Json | null;
  resolution: ConflictResolutionType;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface SyncHistoryEntry {
  id: string;
  sync_job_id: string;
  entity_type: string;
  entity_id: string;
  action: SyncHistoryAction;
  source_system: string;
  target_system: string;
  duration_ms: number | null;
  record_count: number;
  metadata: Json;
  created_at: string;
}

export interface SyncSchedule {
  id: string;
  workspace_id: string;
  integration_id: string;
  sync_type: SyncType;
  cron_expression: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  config: Json;
  created_at: string;
  updated_at: string;
}

// ─── Engine configuration ────────────────────────────────────────

export type ConflictResolutionStrategy =
  | "auto_source_wins"
  | "auto_target_wins"
  | "manual";

export interface SyncEngineConfig {
  maxConcurrentJobs: number;
  retryLimit: number;
  retryDelayMs: number;
  batchSize: number;
  conflictResolution: ConflictResolutionStrategy;
  offlineQueueEnabled: boolean;
}

// ─── Action parameters ───────────────────────────────────────────

export interface CreateSyncJobParams {
  workspaceId: string;
  integrationId?: string;
  syncType?: SyncType;
  direction?: SyncDirection;
  sourceEntity: string;
  targetEntity: string;
  config?: Record<string, unknown>;
}

export interface CompleteSyncJobResult {
  recordsProcessed: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflictsDetected: number;
  durationMs: number;
}

export interface ListSyncJobsParams {
  workspaceId: string;
  status?: SyncJobStatus;
  syncType?: SyncType;
  direction?: SyncDirection;
  integrationId?: string;
  limit?: number;
  offset?: number;
}

export interface ScheduleSyncParams {
  workspaceId: string;
  integrationId: string;
  syncType?: SyncType;
  cronExpression: string;
  config?: Record<string, unknown>;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface SyncStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  pendingJobs: number;
  runningJobs: number;
  successRate: number;
  avgDurationMs: number | null;
  pendingConflicts: number;
  activeSchedules: number;
}

// ─── Engine internal types ───────────────────────────────────────

export interface SyncCredentials {
  accessToken?: string;
  refreshToken?: string;
  apiKey?: string;
  baseUrl?: string;
  [key: string]: string | undefined;
}

export interface SourceRecord {
  id: string;
  [key: string]: unknown;
}

export interface SyncChange {
  action: SyncHistoryAction;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}

export interface ConflictRecord {
  entityType: string;
  entityId: string;
  fieldName: string;
  sourceValue: unknown;
  targetValue: unknown;
}

// ─── Offline queue types ─────────────────────────────────────────

export interface QueuedOperation {
  id: string;
  workspaceId: string;
  entityType: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  data: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

// ─── Response envelope ───────────────────────────────────────────

export interface ServiceResult<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}
