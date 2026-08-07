"use client";

/**
 * Supa AI — Phase 9A Automation — dashboard.
 *
 * Renders the top-level KPIs for the workspace's automation surface:
 * total / active / paused workflows, total / completed / failed runs,
 * success rate, total templates, total webhooks. Includes a recent-
 * runs list and a "top workflows" leaderboard.
 *
 * @module @/components/automation/automation-dashboard
 */
import * as React from "react";
import {
  Activity,
  CheckCircle2,
  ListChecks,
  Webhook,
  XCircle,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkflowRun } from "@/lib/automation/client";
import { useAutomationDashboard } from "@/hooks/use-automation";
import { StatCard } from "@/components/shared/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

export interface AutomationDashboardProps {
  workspaceId: string;
  className?: string;
  /** Called when the user clicks a recent run row. */
  onSelectRun?: (run: WorkflowRun) => void;
}

export function AutomationDashboard({
  workspaceId,
  className,
  onSelectRun,
}: AutomationDashboardProps) {
  const dashboardQuery = useAutomationDashboard(workspaceId);

  if (dashboardQuery.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Couldn&apos;t load the automation dashboard. Please try again later.
      </p>
    );
  }

  const d = dashboardQuery.data;
  const successPct = Math.round(d.successRate * 100);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total workflows"
          value={d.totalWorkflows}
          icon={Zap}
          hint={`${d.activeWorkflows} active · ${d.pausedWorkflows} paused`}
        />
        <StatCard
          label="Total runs"
          value={d.totalRuns}
          icon={Activity}
          hint={`${d.runningRuns} in flight`}
        />
        <StatCard
          label="Completed"
          value={d.completedRuns}
          icon={CheckCircle2}
          trend={successPct}
          trendSuffix="%"
          hint={`${d.failedRuns} failed`}
        />
        <StatCard
          label="Templates"
          value={d.totalTemplates}
          icon={ListChecks}
          hint={`${d.totalWebhooks} webhooks`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentRuns runs={d.recentRuns} onSelectRun={onSelectRun} />
        <TopWorkflows topWorkflows={d.topWorkflows} />
      </div>

      <WebhookNote count={d.totalWebhooks} />
    </div>
  );
}

function RecentRuns({
  runs,
  onSelectRun,
}: {
  runs: WorkflowRun[];
  onSelectRun?: (run: WorkflowRun) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <p className="text-sm font-medium">Recent runs</p>
        <p className="mt-2 text-xs text-muted-foreground">
          No runs yet. Start a workflow to see runs here.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm font-medium">Recent runs</p>
      <ul className="mt-2 space-y-1">
        {runs.slice(0, 8).map((run) => (
          <li key={run.id}>
            <button
              type="button"
              disabled={!onSelectRun}
              onClick={() => onSelectRun?.(run)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                onSelectRun ? "hover:bg-muted" : "",
              )}
            >
              <span className="font-mono text-muted-foreground">
                {run.id.slice(0, 8)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="capitalize">{run.status}</span>
              {run.started_at ? (
                <span className="ml-auto text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopWorkflows({
  topWorkflows,
}: {
  topWorkflows: Array<{ workflowId: string; name: string; runCount: number; successRate: number }>;
}) {
  if (topWorkflows.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-4">
        <p className="text-sm font-medium">Top workflows</p>
        <p className="mt-2 text-xs text-muted-foreground">
          No workflow has run yet.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm font-medium">Top workflows</p>
      <ul className="mt-2 space-y-1">
        {topWorkflows.map((w) => (
          <li
            key={w.workflowId}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
          >
            <Zap className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{w.name}</span>
            <span className="ml-auto inline-flex items-center gap-2 text-muted-foreground">
              <span>{w.runCount} runs</span>
              <span className="inline-flex items-center gap-0.5">
                {Math.round(w.successRate * 100)}%
                <span className="text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebhookNote({ count }: { count: number }) {
  return (
    <div className="rounded-lg border bg-background p-4 text-xs text-muted-foreground">
      <p className="inline-flex items-center gap-1.5">
        <Webhook className="size-3.5" aria-hidden="true" />
        {count === 0 ? (
          <>
            <XCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
            No webhook endpoints yet. Create one from a workflow&apos;s detail page.
          </>
        ) : (
          <>
            <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            {count} webhook endpoint{count === 1 ? "" : "s"} configured.
          </>
        )}
      </p>
    </div>
  );
}
