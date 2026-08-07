"use client";

/**
 * Supa AI — Phase 9A Automation — run list.
 *
 * Renders a list of recent runs with status, duration, and a logs
 * popover. Clicking a row selects it (via `onSelect`) so the parent
 * view can open the run detail panel.
 *
 * @module @/components/automation/run-list
 */
import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  PlayCircle,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  WorkflowLog,
  WorkflowRun,
  WorkflowRunStatus,
} from "@/lib/automation/client";
import { useRunLogs, useWorkflowRuns } from "@/hooks/use-automation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_META: Record<
  WorkflowRunStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    className: "text-muted-foreground",
  },
  running: {
    label: "Running",
    icon: Loader2,
    className: "text-blue-600 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    icon: AlertCircle,
    className: "text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "text-muted-foreground",
  },
};

export interface RunListProps {
  workspaceId: string;
  workflowId: string | null;
  /** Called when the user clicks a row. */
  onSelect?: (run: WorkflowRun) => void;
  /** Called when the user clicks "Retry". */
  onRetry?: (run: WorkflowRun) => void;
  /** Called when the user clicks "Cancel". */
  onCancel?: (run: WorkflowRun) => void;
  className?: string;
  limit?: number;
}

export function RunList({
  workspaceId,
  workflowId,
  onSelect,
  onRetry,
  onCancel,
  className,
  limit = 30,
}: RunListProps) {
  // Use the `useWorkflowRuns` hook to list recent runs for the workflow.
  const runsQuery = useWorkflowRuns(workflowId, limit);

  if (runsQuery.isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!runsQuery.data || runsQuery.data.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No runs yet. Start a workflow to see runs here.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {runsQuery.data.map((run) => (
        <li key={run.id}>
          <RunRow
            workspaceId={workspaceId}
            run={run}
            onSelect={onSelect}
            onRetry={onRetry}
            onCancel={onCancel}
          />
        </li>
      ))}
    </ul>
  );
}

interface RunRowProps {
  workspaceId: string;
  run: WorkflowRun;
  onSelect?: (run: WorkflowRun) => void;
  onRetry?: (run: WorkflowRun) => void;
  onCancel?: (run: WorkflowRun) => void;
}

function RunRow({ workspaceId, run, onSelect, onRetry, onCancel }: RunRowProps) {
  const meta = STATUS_META[run.status];
  const Icon = meta.icon;
  const durationMs = run.completed_at && run.started_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors",
        onSelect ? "cursor-pointer hover:bg-muted/40" : "",
      )}
      onClick={() => onSelect?.(run)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(run);
        }
      }}
    >
      <Icon
        className={cn("size-4 shrink-0", meta.className, run.status === "running" && "animate-spin")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">
            Run <span className="tabular-nums">{run.id.slice(0, 8)}</span>
          </p>
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wide">
            {meta.label}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {run.started_at ? new Date(run.started_at).toLocaleString() : "Not started"}
          {durationMs !== null ? ` · ${formatDuration(durationMs)}` : ""}
          {run.error ? ` · ${run.error}` : ""}
        </p>
      </div>
      <RunLogsButton workspaceId={workspaceId} runId={run.id} />
      {onRetry && (run.status === "failed" || run.status === "cancelled") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onRetry(run);
          }}
        >
          Retry
        </Button>
      ) : null}
      {onCancel && (run.status === "pending" || run.status === "running") ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onCancel(run);
          }}
        >
          Cancel
        </Button>
      ) : null}
    </div>
  );
}

interface RunLogsButtonProps {
  workspaceId: string;
  runId: string;
}

function RunLogsButton({ workspaceId, runId }: RunLogsButtonProps) {
  const [open, setOpen] = React.useState(false);
  const logsQuery = useRunLogs(workspaceId, open ? runId : null, 50);
  const logs: WorkflowLog[] = logsQuery.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <PlayCircle className="size-3.5" aria-hidden="true" />
          Logs
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[420px] p-0"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-80 overflow-y-auto p-3 font-mono text-xs">
          {logsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : logs.length > 0 ? (
            <ul className="space-y-1">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold uppercase",
                      log.level === "error" && "text-destructive",
                      log.level === "warn" && "text-amber-600 dark:text-amber-400",
                      log.level === "info" && "text-blue-600 dark:text-blue-400",
                      log.level === "debug" && "text-muted-foreground",
                    )}
                  >
                    [{log.level}]
                  </span>
                  <span className="break-words">{log.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No logs recorded.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
