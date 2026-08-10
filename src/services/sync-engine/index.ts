/**
 * Sync Engine — barrel export.
 * Re-exports types and all server actions.
 */

// Types
export type {
  SyncJob,
  SyncConflict,
  SyncHistoryEntry,
  SyncSchedule,
  SyncEngineConfig,
  SyncJobStatus,
  SyncType,
  SyncDirection,
  SyncHistoryAction,
  ConflictResolutionType,
  ConflictResolutionStrategy,
  CreateSyncJobParams,
  CompleteSyncJobResult,
  ListSyncJobsParams,
  ScheduleSyncParams,
  PaginatedResult,
  SyncStats,
  ServiceResult,
  SyncCredentials,
  SourceRecord,
  SyncChange,
  ConflictRecord,
  QueuedOperation,
} from "./types";

// Actions (server)
export {
  createSyncJob,
  startSyncJob,
  completeSyncJob,
  failSyncJob,
  cancelSyncJob,
  listSyncJobs,
  getSyncJob,
  runSyncNow,
  scheduleSync,
  listSyncSchedules,
  deleteSyncSchedule,
  detectConflicts,
  resolveConflict,
  listConflicts,
  getSyncHistory,
  getSyncStats,
  retryFailedJob,
  pauseSync,
  resumeSync,
} from "./actions";

// Engine (non-server module)
export { syncEngine } from "./engine";
export type { EngineResult, GetCredentialsFn } from "./engine";

// Offline queue
export { offlineQueue } from "./offline-queue";
