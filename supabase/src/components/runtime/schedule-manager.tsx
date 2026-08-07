"use client";

/**
 * Supa AI — Phase 12 Runtime — schedule manager.
 *
 * Lists the workspace's runtime schedules with status, schedule_type,
 * and next_run_at. Includes a "Create schedule" dialog that lets the
 * user define a schedule (immediate, delayed, scheduled, recurring,
 * event_triggered, or manual) that targets an agent, workflow, task,
 * or process.
 *
 * @module @/components/runtime/schedule-manager
 */
import * as React from "react";
import { CalendarClock, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  CreateScheduleInput,
  RuntimeSchedule,
  RuntimeScheduleType,
} from "@/lib/runtime/types";
import { useCreateSchedule, useRuntimeSchedules } from "@/hooks/use-runtime";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  SCHEDULE_STATUS_STYLES,
  formatTime,
  humanize,
} from "./status-styles";

export interface ScheduleManagerProps {
  workspaceId: string;
  className?: string;
}

const SCHEDULE_TYPES: { value: RuntimeScheduleType; label: string }[] = [
  { value: "immediate", label: "Immediate" },
  { value: "delayed", label: "Delayed" },
  { value: "scheduled", label: "Scheduled" },
  { value: "recurring", label: "Recurring" },
  { value: "event_triggered", label: "Event-triggered" },
  { value: "manual", label: "Manual" },
];

const TARGET_TYPES: { value: "agent" | "workflow" | "task" | "process"; label: string }[] = [
  { value: "agent", label: "Agent" },
  { value: "workflow", label: "Workflow" },
  { value: "task", label: "Task" },
  { value: "process", label: "Process" },
];

export function ScheduleManager({
  workspaceId,
  className,
}: ScheduleManagerProps) {
  const { toast } = useToast();
  const query = useRuntimeSchedules(workspaceId);
  const createMutation = useCreateSchedule();
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className={cn("space-y-4", className)}>
      <SectionCard
        title="Runtime schedules"
        description="Every schedule tracked by the Supa OS Runtime — immediate, delayed, scheduled, recurring, event-triggered, and manual."
        icon={CalendarClock}
        action={
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New schedule
          </Button>
        }
        contentClassName="p-0"
      >
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarClock}
              title="Couldn't load schedules"
              description="Please try again later."
            />
          </div>
        ) : !query.data || query.data.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarClock}
              title="No schedules yet"
              description="Create your first schedule to trigger an agent, workflow, task, or process on a schedule."
              action={
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  New schedule
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead className="text-center">Runs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((s) => (
                  <ScheduleRow key={s.id} schedule={s} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <CreateScheduleDialog
        workspaceId={workspaceId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          try {
            await createMutation.mutateAsync(input);
            toast({ title: "Schedule created" });
            setCreateOpen(false);
          } catch (err) {
            toast({
              title: "Failed to create schedule",
              description: err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            });
          }
        }}
        pending={createMutation.isPending}
      />
    </div>
  );
}

function ScheduleRow({ schedule }: { schedule: RuntimeSchedule }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="min-w-0">
          <p className="truncate">{schedule.name}</p>
          {schedule.description ? (
            <p className="text-xs text-muted-foreground truncate">
              {schedule.description}
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {humanize(schedule.schedule_type)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <span className="capitalize">{schedule.target_type}</span>
        {" · "}
        <span className="font-mono">{schedule.target_id.slice(0, 8)}</span>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase tracking-wide",
            SCHEDULE_STATUS_STYLES[schedule.status] ??
              "border-transparent bg-muted text-muted-foreground",
          )}
        >
          {humanize(schedule.status)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {formatTime(schedule.next_run_at)}
      </TableCell>
      <TableCell className="text-center tabular-nums text-xs">
        {schedule.run_count}
        {schedule.max_runs ? ` / ${schedule.max_runs}` : ""}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Create schedule dialog
// ---------------------------------------------------------------------------

interface CreateScheduleDialogProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: CreateScheduleInput) => void | Promise<void>;
  pending: boolean;
}

function CreateScheduleDialog({
  workspaceId,
  open,
  onOpenChange,
  onSubmit,
  pending,
}: CreateScheduleDialogProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scheduleType, setScheduleType] =
    React.useState<RuntimeScheduleType>("scheduled");
  const [cronExpression, setCronExpression] = React.useState("");
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [delayMs, setDelayMs] = React.useState("");
  const [eventTrigger, setEventTrigger] = React.useState("");
  const [targetType, setTargetType] = React.useState<
    "agent" | "workflow" | "task" | "process"
  >("workflow");
  const [targetId, setTargetId] = React.useState("");

  const reset = React.useCallback(() => {
    setName("");
    setDescription("");
    setScheduleType("scheduled");
    setCronExpression("");
    setScheduledFor("");
    setDelayMs("");
    setEventTrigger("");
    setTargetType("workflow");
    setTargetId("");
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleSubmit = React.useCallback(() => {
    if (!name.trim() || !targetId.trim()) return;
    const input: CreateScheduleInput = {
      workspace_id: workspaceId,
      name: name.trim(),
      description: description.trim() || undefined,
      schedule_type: scheduleType,
      cron_expression: cronExpression.trim() || undefined,
      scheduled_for: scheduledFor || undefined,
      delay_ms: delayMs ? Number(delayMs) : undefined,
      event_trigger: eventTrigger.trim() || undefined,
      target_type: targetType,
      target_id: targetId.trim(),
    };
    void onSubmit(input);
  }, [
    name,
    description,
    scheduleType,
    cronExpression,
    scheduledFor,
    delayMs,
    eventTrigger,
    targetType,
    targetId,
    workspaceId,
    onSubmit,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create schedule</DialogTitle>
          <DialogDescription>
            Trigger an agent, workflow, task, or process on a schedule.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily standup summary"
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Description (optional)
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this schedule do?"
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Schedule type
            </label>
            <Select
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as RuntimeScheduleType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Target type
            </label>
            <Select
              value={targetType}
              onValueChange={(v) =>
                setTargetType(v as typeof targetType)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Target type" />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Target ID
            </label>
            <Input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="workflow / agent / task / process UUID"
              className="font-mono text-xs"
            />
          </div>
          {scheduleType === "recurring" ? (
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Cron expression
              </label>
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1-5"
                className="font-mono text-xs"
              />
            </div>
          ) : null}
          {scheduleType === "scheduled" ? (
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Scheduled for (ISO 8601)
              </label>
              <Input
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                placeholder="2025-12-31T09:00:00Z"
                className="font-mono text-xs"
              />
            </div>
          ) : null}
          {scheduleType === "delayed" ? (
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Delay (ms)
              </label>
              <Input
                type="number"
                value={delayMs}
                onChange={(e) => setDelayMs(e.target.value)}
                placeholder="60000"
                className="font-mono text-xs"
              />
            </div>
          ) : null}
          {scheduleType === "event_triggered" ? (
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Event trigger
              </label>
              <Input
                value={eventTrigger}
                onChange={(e) => setEventTrigger(e.target.value)}
                placeholder="task.completed"
                className="font-mono text-xs"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !targetId.trim() || pending}
            onClick={handleSubmit}
          >
            {pending ? "Creating…" : "Create schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
