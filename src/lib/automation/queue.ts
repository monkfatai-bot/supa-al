/**
 * Supa AI — Phase 9A Automation — Background Run Queue.
 *
 * Thin wrapper around `setImmediate` that lets the service layer +
 * dispatcher enqueue a workflow run for background processing without
 * blocking the request. The queue is in-process only — when the Node
 * process exits, in-flight runs are picked up by the next request that
 * triggers `checkStaleRuns` (or by a future external cron). For Phase
 * 9A the in-process queue is sufficient: every API route that starts
 * a run responds immediately with the run id, and the UI polls the run
 * status endpoint until it settles.
 *
 * The queue is a singleton — every run goes through one instance so the
 * `pending` / `active` counts are accurate across the process.
 *
 * Server-only: uses `setImmediate` (Node-only) and the executor.
 *
 * @module @/lib/automation/queue
 */
import "server-only";

import { logger } from "@/lib/logger";

import { WorkflowExecutor } from "./executor";
import type { WorkflowExecutionResult } from "./types";

// ---------------------------------------------------------------------------
// Queue class
// ---------------------------------------------------------------------------

/**
 * A single enqueued run. Carries the executor instance + run id so the
 * consumer doesn't need to look them up at execution time.
 */
interface EnqueuedRun {
  runId: string;
  executor: WorkflowExecutor;
  enqueuedAt: number;
}

/** Listener invoked when a run completes (success or failure). */
export type RunCompletionListener = (result: WorkflowExecutionResult) => void;

/**
 * In-process background queue for workflow runs. Wraps `setImmediate`
 * so each run is processed in its own macrotask — the request that
 * enqueued it never blocks on the run's outcome.
 */
export class RunQueue {
  private readonly pending: Map<string, EnqueuedRun> = new Map();
  private readonly active: Set<string> = new Set();
  private readonly listeners: Set<RunCompletionListener> = new Set();
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private maxConcurrent = 8;

  /**
   * Enqueue a run for background execution. Returns immediately — the
   * caller should poll the run status endpoint (or attach a
   * {@link RunCompletionListener}) to learn the outcome.
   */
  enqueue(executor: WorkflowExecutor, runId: string, delayMs = 0): void {
    if (this.pending.has(runId) || this.active.has(runId)) {
      // Already queued — dedupe.
      return;
    }
    this.pending.set(runId, { runId, executor, enqueuedAt: Date.now() });
    if (delayMs > 0) {
      const timer = setTimeout(() => {
        this.timers.delete(runId);
        void this.drain();
      }, delayMs);
      this.timers.set(runId, timer);
    } else {
      setImmediate(() => {
        void this.drain();
      });
    }
  }

  /**
   * Register a listener that fires after every run completes. Returns
   * an unsubscribe function.
   */
  onComplete(listener: RunCompletionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Number of runs currently waiting to start. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Number of runs currently executing. */
  get activeCount(): number {
    return this.active.size;
  }

  /** Adjust the concurrency cap at runtime. */
  setMaxConcurrent(n: number): void {
    this.maxConcurrent = Math.max(1, Math.floor(n));
  }

  /**
   * Cancel a pending or active run. For active runs, this only removes
   * the queue's bookkeeping — the run itself is cancelled via the
   * service's `cancelRun` method.
   */
  cancel(runId: string): void {
    this.pending.delete(runId);
    this.active.delete(runId);
    const timer = this.timers.get(runId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(runId);
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async drain(): Promise<void> {
    while (this.active.size < this.maxConcurrent && this.pending.size > 0) {
      const next = this.nextPending();
      if (!next) break;
      this.active.add(next.runId);
      void this.process(next);
    }
  }

  private nextPending(): EnqueuedRun | null {
    for (const [id, entry] of this.pending) {
      this.pending.delete(id);
      return entry;
    }
    return null;
  }

  private async process(entry: EnqueuedRun): Promise<void> {
    const { runId, executor } = entry;
    try {
      const result = await executor.executeWorkflow(runId);
      for (const listener of this.listeners) {
        try {
          listener(result);
        } catch (err) {
          logger.warn("automation.queue.listener_threw", {
            runId,
            cause: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      logger.error("automation.queue.run_crashed", {
        runId,
        cause: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.active.delete(runId);
      // If there are still pending runs, keep draining.
      if (this.pending.size > 0) {
        setImmediate(() => {
          void this.drain();
        });
      }
    }
  }
}

/** Singleton queue — shared across the process. */
export const runQueue = new RunQueue();
