"use client";

/**
 * Supa AI — Phase 12 Runtime — status badge helpers.
 *
 * Small shared utilities that map runtime status / level strings to a
 * colored pill `className`. Used by every runtime list view so the
 * palette stays consistent (emerald = good, amber = pending/warn,
 * red = failed/error, gray = cancelled/disabled).
 *
 * @module @/components/runtime/status-styles
 */

/** Color class for a {@link RuntimeProcessStatus}. */
export const PROCESS_STATUS_STYLES: Record<string, string> = {
  pending:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  running:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paused:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  completed:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  cancelled:
    "border-transparent bg-muted text-muted-foreground",
  crashed:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
};

/** Color class for a {@link RuntimeTaskStatus}. */
export const TASK_STATUS_STYLES: Record<string, string> = {
  queued:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  running:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  completed:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  cancelled:
    "border-transparent bg-muted text-muted-foreground",
  timeout:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  retrying:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

/** Color class for an event level (info / warn / error / debug / fatal). */
export const EVENT_LEVEL_STYLES: Record<string, string> = {
  debug:
    "border-transparent bg-muted text-muted-foreground",
  info:
    "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warn:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  fatal:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
};

/** Color class for a schedule status. */
export const SCHEDULE_STATUS_STYLES: Record<string, string> = {
  active:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paused:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  completed:
    "border-transparent bg-muted text-muted-foreground",
  failed:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
};

/** Color class for a recovery status. */
export const RECOVERY_STATUS_STYLES: Record<string, string> = {
  pending:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  in_progress:
    "border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300",
  completed:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  failed:
    "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
  abandoned:
    "border-transparent bg-muted text-muted-foreground",
};

/** Humanize a snake_case string — `running`, `in_progress` → `In progress`. */
export function humanize(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Format an ISO timestamp (or null) as a short local string. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format a duration in milliseconds as `1m 23s` / `42ms` / `1h 02m`. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${String(remSec).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `${hours}h ${String(remMin).padStart(2, "0")}m`;
}
