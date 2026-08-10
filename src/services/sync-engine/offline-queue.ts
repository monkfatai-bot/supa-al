/**
 * Offline Queue — buffers failed sync operations in memory with
 * persistence via integration_logs for crash recovery.
 */

import { createServiceClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";
import type { QueuedOperation } from "./types";

// ─── In-memory queue (per workspace) ────────────────────────────

const queueMap = new Map<string, QueuedOperation[]>();

function getQueue(workspaceId: string): QueuedOperation[] {
  let queue = queueMap.get(workspaceId);
  if (!queue) {
    queue = [];
    queueMap.set(workspaceId, queue);
  }
  return queue;
}

function generateId(): string {
  return crypto.randomUUID();
}

// ─── OfflineQueue class ─────────────────────────────────────────

class OfflineQueue {
  /**
   * Add an operation to the in-memory queue and persist it
   * to integration_logs for crash recovery.
   */
  async enqueue(
    workspaceId: string,
    operation: Omit<QueuedOperation, "id" | "workspaceId" | "createdAt" | "retryCount">
  ): Promise<QueuedOperation> {
    const entry: QueuedOperation = {
      ...operation,
      id: generateId(),
      workspaceId,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    getQueue(workspaceId).push(entry);

    // Persist to integration_logs for durability
    try {
      const db = createServiceClient();
      await db.from("integration_logs").insert({
        workspace_id: workspaceId,
        action: "offline_queue_enqueue",
        direction: "outbound",
        request: entry as unknown as Record<string, unknown>,
        status: "success",
      });
    } catch (err) {
      logger.warn("Failed to persist offline queue entry", {
        workspaceId,
        operationId: entry.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    logger.debug("Enqueued offline operation", {
      workspaceId,
      operationId: entry.id,
      entityType: entry.entityType,
      entityId: entry.entityId,
      op: entry.operation,
    });

    return entry;
  }

  /**
   * Remove and return the next pending operation for a workspace.
   */
  dequeue(workspaceId: string): QueuedOperation | null {
    const queue = getQueue(workspaceId);
    if (queue.length === 0) return null;
    return queue.shift() ?? null;
  }

  /**
   * Process all pending operations using the provided processor function.
   * Successfully processed ops are removed; failed ones stay in the queue
   * with an incremented retry count.
   */
  async processQueue(
    workspaceId: string,
    processor: (op: QueuedOperation) => Promise<boolean>
  ): Promise<{ processed: number; failed: number; remaining: number }> {
    const queue = getQueue(workspaceId);
    let processed = 0;
    let failed = 0;

    const stillPending: QueuedOperation[] = [];

    for (const op of queue) {
      try {
        const success = await processor(op);
        if (success) {
          processed++;
          logger.debug("Offline operation processed successfully", {
            workspaceId,
            operationId: op.id,
          });
        } else {
          op.retryCount++;
          stillPending.push(op);
          failed++;
          logger.warn("Offline operation failed", {
            workspaceId,
            operationId: op.id,
            retryCount: op.retryCount,
          });
        }
      } catch (err) {
        op.retryCount++;
        stillPending.push(op);
        failed++;
        logger.error("Offline operation threw", {
          workspaceId,
          operationId: op.id,
          retryCount: op.retryCount,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Replace queue contents with only the still-pending items
    queueMap.set(workspaceId, stillPending);

    return {
      processed,
      failed,
      remaining: stillPending.length,
    };
  }

  /**
   * Return the number of pending operations for a workspace.
   */
  getQueueSize(workspaceId: string): number {
    return getQueue(workspaceId).length;
  }

  /**
   * Clear all pending operations for a workspace.
   */
  clearQueue(workspaceId: string): number {
    const queue = getQueue(workspaceId);
    const count = queue.length;
    queue.length = 0;
    return count;
  }

  /**
   * Restore the in-memory queue from integration_logs entries.
   * Call this on startup / initialisation to recover from a crash.
   */
  async restoreFromPersistence(workspaceId: string): Promise<number> {
    try {
      const db = createServiceClient();
      const { data, error } = await db
        .from("integration_logs")
        .select("request")
        .eq("workspace_id", workspaceId)
        .eq("action", "offline_queue_enqueue")
        .order("created_at", { ascending: true });

      if (error || !data) return 0;

      const queue = getQueue(workspaceId);
      let restored = 0;

      for (const row of data) {
        const op = row.request as QueuedOperation;
        if (op && op.id && op.entityType) {
          // Avoid duplicates
          if (!queue.some((existing) => existing.id === op.id)) {
            queue.push(op);
            restored++;
          }
        }
      }

      if (restored > 0) {
        logger.info("Restored offline queue from persistence", {
          workspaceId,
          restored,
        });
      }

      return restored;
    } catch (err) {
      logger.error("Failed to restore offline queue", {
        workspaceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return 0;
    }
  }
}

/** Singleton queue instance */
export const offlineQueue = new OfflineQueue();
