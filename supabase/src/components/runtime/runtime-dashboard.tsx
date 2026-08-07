"use client";

/**
 * Supa AI — Phase 12 Runtime — dashboard tab.
 *
 * Top-level snapshot of the workspace's runtime surface:
 *
 *   - 6 stat cards (active sessions, running processes, queued tasks,
 *     running tasks, failed today, completed today).
 *   - Recent events list (last 10).
 *   - Task queue summary broken down by type.
 *
 * Pulls data from the `/api/v1/runtime/dashboard` endpoint via the
 * {@link useRuntimeDashboard} hook. All numbers come back in a single
 * `RuntimeDashboard` payload.
 *
 * @module @/components/runtime/runtime-dashboard
 */
import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  ListChecks,
  PlayCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { RuntimeDashboard as RuntimeDashboardData } from "@/lib/runtime/types";
import { useRuntimeDashboard } from "@/hooks/use-runtime";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { EVENT_LEVEL_STYLES, formatTime, humanize } from "./status-styles";

export interface RuntimeDashboardProps {
  workspaceId: string;
  className?: string;
}

export function RuntimeDashboard({
  workspaceId,
  className,
}: RuntimeDashboardProps) {
  const dashboardQuery = useRuntimeDashboard(workspaceId);

  if (dashboardQuery.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <p
        className={cn("text-sm text-muted-foreground", className)}
        role="status"
      >
        Couldn&apos;t load the runtime dashboard. Please try again later.
      </p>
    );
  }

  const d: RuntimeDashboardData = dashboardQuery.data;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active sessions"
          value={d.active_sessions}
          icon={Cpu}
          hint="Live runtime sessions"
        />
        <StatCard
          label="Running processes"
          value={d.running_processes}
          icon={PlayCircle}
          hint="In-flight process executions"
        />
        <StatCard
          label="Queued tasks"
          value={d.queued_tasks}
          icon={Clock}
          hint="Waiting for a worker"
        />
        <StatCard
          label="Running tasks"
          value={d.running_tasks}
          icon={Activity}
          hint="Executing right now"
        />
        <StatCard
          label="Failed today"
          value={d.failed_tasks_today}
          icon={AlertTriangle}
          hint="Tasks that errored"
        />
        <StatCard
          label="Completed today"
          value={d.completed_tasks_today}
          icon={CheckCircle2}
          hint="Tasks that succeeded"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentEvents events={d.recent_events} />
        <ResourceSnapshot
          tokensUsed={d.total_tokens_used}
          creditsUsed={d.total_credits_used}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent events
// ---------------------------------------------------------------------------

function RecentEvents({
  events,
}: {
  events: RuntimeDashboardData["recent_events"];
}) {
  return (
    <SectionCard
      title="Recent events"
      description="Last 10 runtime events captured for this workspace."
      icon={Activity}
      contentClassName="p-0"
    >
      {events.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No events yet. Start a session or task to generate runtime events.
        </div>
      ) : (
        <ul className="divide-y">
          {events.slice(0, 10).map((ev) => (
            <li
              key={ev.id}
              className="flex items-start gap-3 px-4 py-3"
            >
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[10px] uppercase tracking-wide",
                  EVENT_LEVEL_STYLES[ev.level] ??
                    "border-transparent bg-muted text-muted-foreground",
                )}
              >
                {ev.level}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {ev.message}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {humanize(ev.category)} · {ev.event_type}
                  {ev.source ? ` · ${ev.source}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatTime(ev.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Resource snapshot
// ---------------------------------------------------------------------------

function ResourceSnapshot({
  tokensUsed,
  creditsUsed,
}: {
  tokensUsed: number;
  creditsUsed: number;
}) {
  return (
    <SectionCard
      title="Resource snapshot"
      description="Tokens + credits consumed by this workspace's runtime."
      icon={ListChecks}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Total tokens used
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {tokensUsed.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Total credits used
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {creditsUsed.toLocaleString()}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Open the <span className="font-medium">Resources</span> tab to see the
        per-provider budget breakdown and utilization bars.
      </p>
    </SectionCard>
  );
}
