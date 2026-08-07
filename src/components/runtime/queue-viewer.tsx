"use client";

/**
 * Supa AI — Phase 12 Runtime — task queue viewer.
 *
 * Renders the workspace's {@link TaskQueueSummary}:
 *
 *   - Total / queued / running / completed / failed / retrying counts.
 *   - By-task-type breakdown (table).
 *   - By-priority breakdown (table).
 *
 * The component is intended to be embedded inside the dashboard tab as
 * a summary card, but is also exposed as a standalone component for
 * callers that want a deeper view.
 *
 * @module @/components/runtime/queue-viewer
 */
import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TaskQueueSummary } from "@/lib/runtime/types";
import { useRuntimeQueue } from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { humanize } from "./status-styles";

export interface QueueViewerProps {
  workspaceId: string;
  className?: string;
}

export function QueueViewer({ workspaceId, className }: QueueViewerProps) {
  const query = useRuntimeQueue(workspaceId);

  if (query.isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className={cn(className)}>
        <EmptyState
          icon={Inbox}
          title="Couldn't load the queue"
          description="Please try again later."
        />
      </div>
    );
  }

  const summary: TaskQueueSummary = query.data;
  const byType = Object.entries(summary.by_type).sort((a, b) => b[1] - a[1]);
  const byPriority = Object.entries(summary.by_priority).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Total" value={summary.total} tone="default" />
        <SummaryTile label="Queued" value={summary.queued} tone="amber" />
        <SummaryTile label="Running" value={summary.running} tone="emerald" />
        <SummaryTile label="Completed" value={summary.completed} tone="emerald" />
        <SummaryTile label="Failed" value={summary.failed} tone="red" />
        <SummaryTile label="Retrying" value={summary.retrying} tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="By task type"
          description="Queue depth broken down by task type."
          contentClassName="p-0"
        >
          {byType.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No tasks in the queue yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byType.map(([type, count]) => (
                  <TableRow key={type}>
                    <TableCell className="font-medium">
                      {humanize(type)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.total > 0
                        ? `${Math.round((count / summary.total) * 100)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>

        <SectionCard
          title="By priority"
          description="Queue depth broken down by priority level."
          contentClassName="p-0"
        >
          {byPriority.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No tasks in the queue yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byPriority.map(([prio, count]) => (
                  <TableRow key={prio}>
                    <TableCell className="font-medium">
                      <PriorityBadge priority={Number(prio)} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {summary.total > 0
                        ? `${Math.round((count / summary.total) * 100)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TILE_TONES: Record<string, string> = {
  default: "border-border bg-background",
  amber: "border-amber-500/30 bg-amber-500/5",
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  red: "border-red-500/30 bg-red-500/5",
};

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "amber" | "emerald" | "red";
}) {
  return (
    <div className={cn("rounded-lg border p-3", TILE_TONES[tone])}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: number }) {
  const tone =
    priority >= 8
      ? "border-transparent bg-red-500/10 text-red-700 dark:text-red-400"
      : priority >= 5
        ? "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : "border-transparent bg-muted text-muted-foreground";
  const label =
    priority >= 8 ? "Critical" : priority >= 5 ? "High" : "Normal";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{priority}</span>
      <Badge variant="outline" className={cn("text-[10px] uppercase", tone)}>
        {label}
      </Badge>
    </span>
  );
}
