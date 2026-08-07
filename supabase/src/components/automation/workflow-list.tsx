"use client";

/**
 * Supa AI — Phase 9A Automation — workflow list.
 *
 * Renders a searchable, filterable list of the workspace's workflows.
 * Each row shows the workflow's name, status badge, trigger count,
 * action count, and a "Run now" button.
 *
 * Clicking a row selects it (via `onSelect`) so the parent view can
 * open the workflow detail drawer.
 *
 * @module @/components/automation/workflow-list
 */
import * as React from "react";
import { Play, Search, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  Workflow,
  WorkflowStatus,
  WorkflowWithRelations,
} from "@/lib/automation/client";
import { useWorkflows } from "@/hooks/use-automation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  draft: "Draft",
};

const STATUS_VARIANT: Record<WorkflowStatus, string> = {
  active:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  paused: "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  archived: "border-transparent bg-muted text-muted-foreground",
  draft: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
};

export interface WorkflowListProps {
  workspaceId: string;
  onSelect?: (workflow: WorkflowWithRelations) => void;
  /** Called when the user clicks the "Run now" button. */
  onRun?: (workflow: WorkflowWithRelations) => void;
  /** Called when the user clicks the "New workflow" button. */
  onCreate?: () => void;
  className?: string;
}

export function WorkflowList({
  workspaceId,
  onSelect,
  onRun,
  onCreate,
  className,
}: WorkflowListProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<WorkflowStatus | "all">("all");
  const debounced = React.useDeferredValue(search);

  const workflowsQuery = useWorkflows(workspaceId, {
    search: debounced || undefined,
    status: status === "all" ? undefined : status,
    limit: 50,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Search workflows…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as WorkflowStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {onCreate ? (
          <Button onClick={onCreate} size="sm" className="gap-1.5">
            <Zap className="size-3.5" aria-hidden="true" />
            New workflow
          </Button>
        ) : null}
      </div>

      {workflowsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : workflowsQuery.data && workflowsQuery.data.length > 0 ? (
        <ul className="space-y-2">
          {workflowsQuery.data.map((w) => (
            <li key={w.id}>
              <WorkflowRow workflow={w} onSelect={onSelect} onRun={onRun} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Zap}
          title="No workflows yet"
          description="Create your first automation workflow, or browse the template library to start from a prebuilt recipe."
          action={
            onCreate ? (
              <Button onClick={onCreate} size="sm" className="gap-1.5">
                <Zap className="size-3.5" aria-hidden="true" />
                New workflow
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

interface WorkflowRowProps {
  workflow: WorkflowWithRelations;
  onSelect?: (workflow: WorkflowWithRelations) => void;
  onRun?: (workflow: WorkflowWithRelations) => void;
}

function WorkflowRow({ workflow, onSelect, onRun }: WorkflowRowProps) {
  const triggerCount = workflow.triggers.filter((t) => t.is_active).length;
  const actionCount = workflow.actions.filter((a) => a.is_active).length;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors",
        onSelect ? "cursor-pointer hover:bg-muted/40" : "",
      )}
      onClick={() => onSelect?.(workflow)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect(workflow);
        }
      }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <Zap className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{workflow.name}</p>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px] uppercase tracking-wide", STATUS_VARIANT[workflow.status])}
          >
            {STATUS_LABEL[workflow.status]}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {workflow.description ?? "No description."}
          {" · "}
          {triggerCount} trigger{triggerCount === 1 ? "" : "s"}
          {" · "}
          {actionCount} action{actionCount === 1 ? "" : "s"}
        </p>
      </div>
      {onRun ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={workflow.status === "archived"}
          onClick={(e) => {
            e.stopPropagation();
            onRun(workflow);
          }}
        >
          <Play className="size-3.5" aria-hidden="true" />
          Run
        </Button>
      ) : null}
    </div>
  );
}

// Re-export the row shape so callers can compose without re-importing the lib type.
export type { Workflow };
