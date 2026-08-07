"use client";

/**
 * Supa AI — Phase 12 Runtime — process explorer.
 *
 * Lists the workspace's runtime processes with status badges, process
 * type, priority, assigned agent, started_at, and duration. Includes
 * filters by status and process_type.
 *
 * Color-coded status badges:
 *   - running   → emerald
 *   - pending   → amber
 *   - failed    → red
 *   - cancelled → gray
 *
 * @module @/components/runtime/process-explorer
 */
import * as React from "react";
import { ServerCog } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  RuntimeProcess,
  RuntimeProcessStatus,
  RuntimeProcessType,
} from "@/lib/runtime/types";
import { useRuntimeProcesses } from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PROCESS_STATUS_STYLES,
  formatDuration,
  formatTime,
  humanize,
} from "./status-styles";

export interface ProcessExplorerProps {
  workspaceId: string;
  className?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "crashed", label: "Crashed" },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "agent", label: "Agent" },
  { value: "workflow", label: "Workflow" },
  { value: "task", label: "Task" },
  { value: "supervisor", label: "Supervisor" },
  { value: "worker", label: "Worker" },
  { value: "scheduler", label: "Scheduler" },
  { value: "monitor", label: "Monitor" },
];

export function ProcessExplorer({
  workspaceId,
  className,
}: ProcessExplorerProps) {
  const [status, setStatus] = React.useState<string>("all");
  const [processType, setProcessType] = React.useState<string>("all");

  const query = useRuntimeProcesses(workspaceId, {
    status: status === "all" ? undefined : (status as RuntimeProcessStatus),
    process_type:
      processType === "all" ? undefined : (processType as RuntimeProcessType),
    limit: 100,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime processes"
        description="Every runtime process tracked for this workspace — agents, workflows, supervisors, and worker processes."
        icon={ServerCog}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={processType} onValueChange={setProcessType}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        contentClassName="p-0"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <EmptyState
              icon={ServerCog}
              title="Couldn't load processes"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ServerCog}
              title="No processes yet"
              description="Runtime processes (agent runs, workflow executions, supervisor tasks) will appear here once they start."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Priority</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((p) => (
                  <ProcessRow key={p.id} process={p} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ProcessRow({ process }: { process: RuntimeProcess }) {
  const duration =
    process.duration_ms ??
    (process.started_at
      ? Date.now() - new Date(process.started_at).getTime()
      : null);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="min-w-0">
          <p className="truncate">{process.name}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {process.id.slice(0, 8)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {humanize(process.process_type)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            PROCESS_STATUS_STYLES[process.status] ??
              "border-transparent bg-muted text-muted-foreground",
          )}
        >
          {humanize(process.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {process.priority}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {process.assigned_to ? (
          <span className="font-mono">{process.assigned_to.slice(0, 8)}</span>
        ) : (
          <span>—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatTime(process.started_at)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">
        {formatDuration(duration)}
      </TableCell>
    </TableRow>
  );
}
