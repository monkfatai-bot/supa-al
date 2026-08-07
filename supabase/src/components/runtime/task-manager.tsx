"use client";

/**
 * Supa AI — Phase 12 Runtime — task manager.
 *
 * Lists the workspace's runtime tasks with status, task_type, priority,
 * name, and scheduled_for. Includes filters by status and task_type,
 * and per-task Cancel + Retry action buttons.
 *
 * Color-coded status badges match the runtime palette:
 *   - running / completed → emerald
 *   - queued / retrying / timeout → amber
 *   - failed → red
 *   - cancelled → gray
 *
 * @module @/components/runtime/task-manager
 */
import * as React from "react";
import { ListChecks, RotateCcw, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  RuntimeTask,
  RuntimeTaskStatus,
  RuntimeTaskType,
} from "@/lib/runtime/types";
import {
  useCancelTask,
  useRetryTask,
  useRuntimeTasks,
} from "@/hooks/use-runtime";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  TASK_STATUS_STYLES,
  formatTime,
  humanize,
} from "./status-styles";

export interface TaskManagerProps {
  workspaceId: string;
  className?: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "timeout", label: "Timeout" },
  { value: "retrying", label: "Retrying" },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "chat", label: "Chat" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "voice", label: "Voice" },
  { value: "sync", label: "Sync" },
  { value: "webhook", label: "Webhook" },
  { value: "workflow_action", label: "Workflow action" },
  { value: "agent_action", label: "Agent action" },
  { value: "business", label: "Business" },
  { value: "custom", label: "Custom" },
];

/** Statuses that can be cancelled (in-flight or scheduled). */
const CANCELLABLE: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "retrying",
]);

/** Statuses that can be retried (terminal failures). */
const RETRYABLE: ReadonlySet<string> = new Set([
  "failed",
  "timeout",
  "cancelled",
]);

export function TaskManager({ workspaceId, className }: TaskManagerProps) {
  const [status, setStatus] = React.useState<string>("all");
  const [taskType, setTaskType] = React.useState<string>("all");

  const query = useRuntimeTasks(workspaceId, {
    status: status === "all" ? undefined : (status as RuntimeTaskStatus),
    task_type: taskType === "all" ? undefined : (taskType as RuntimeTaskType),
    limit: 100,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime tasks"
        description="Every task tracked by the Supa OS Runtime — queued, running, completed, and failed tasks. Cancel or retry tasks in-flight."
        icon={ListChecks}
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
            <Select value={taskType} onValueChange={setTaskType}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
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
              icon={ListChecks}
              title="Couldn't load tasks"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ListChecks}
              title="No tasks yet"
              description="Runtime tasks (chat, image, video, voice, agent actions) will appear here once they're scheduled."
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
                  <TableHead>Scheduled for</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    workspaceId={workspaceId}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function TaskRow({
  task,
  workspaceId,
}: {
  task: RuntimeTask;
  workspaceId: string;
}) {
  const { toast } = useToast();
  const cancelMutation = useCancelTask();
  const retryMutation = useRetryTask();

  const handleCancel = React.useCallback(() => {
    cancelMutation.mutate(
      { id: task.id, workspaceId },
      {
        onSuccess: () => {
          toast({ title: "Task cancelled" });
        },
        onError: (err: Error) => {
          toast({
            title: "Failed to cancel task",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  }, [cancelMutation, task.id, workspaceId, toast]);

  const handleRetry = React.useCallback(() => {
    retryMutation.mutate(
      { id: task.id, workspaceId },
      {
        onSuccess: () => {
          toast({ title: "Task queued for retry" });
        },
        onError: (err: Error) => {
          toast({
            title: "Failed to retry task",
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  }, [retryMutation, task.id, workspaceId, toast]);

  const canCancel = CANCELLABLE.has(task.status);
  const canRetry = RETRYABLE.has(task.status);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="min-w-0">
          <p className="truncate">{task.name}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {task.id.slice(0, 8)}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {humanize(task.task_type)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            TASK_STATUS_STYLES[task.status] ??
              "border-transparent bg-muted text-muted-foreground",
          )}
        >
          {humanize(task.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {task.priority}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatTime(task.scheduled_for)}
      </TableCell>
      <TableCell className="text-right">
        <div className="inline-flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!canRetry || retryMutation.isPending}
            onClick={handleRetry}
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            Retry
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!canCancel || cancelMutation.isPending}
            onClick={handleCancel}
          >
            <XCircle className="size-3" aria-hidden="true" />
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
