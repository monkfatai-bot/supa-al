"use client";

/**
 * Supa AI — Phase 12 Supa OS Runtime — main view.
 *
 * Tabbed container that composes every runtime sub-component into a
 * single full-height surface:
 *
 *   - Dashboard  : {@link RuntimeDashboard} — KPIs, recent events, queue.
 *   - Processes  : {@link ProcessExplorer} — runtime processes with filters.
 *   - Tasks      : {@link TaskManager} — runtime tasks with cancel/retry.
 *   - Schedules  : {@link ScheduleManager} — schedules + create dialog.
 *   - Events     : {@link EventViewer} — runtime events with level badges.
 *   - Logs       : {@link RuntimeLogs} — runtime logs with filters.
 *   - Resources  : {@link ResourceDashboard} — utilization + budgets.
 *   - Recovery   : {@link RecoveryPanel} — checkpoints + recovery records.
 *
 * Owns the active-workspace state (resolved from `useWorkspaces`) and
 * passes it down to the sub-components. The brand accent is emerald.
 *
 * @module @/components/runtime/runtime-view
 */
import * as React from "react";
import {
  Activity,
  CalendarClock,
  Cpu,
  GaugeCircle,
  History,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  ServerCog,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaces as useWorkspaceList } from "@/hooks/use-workspace";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import { RuntimeDashboard } from "./runtime-dashboard";
import { ProcessExplorer } from "./process-explorer";
import { TaskManager } from "./task-manager";
import { ScheduleManager } from "./schedule-manager";
import { EventViewer } from "./event-viewer";
import { RuntimeLogs } from "./runtime-logs";
import { ResourceDashboard } from "./resource-dashboard";
import { RecoveryPanel } from "./recovery-panel";

type Tab =
  | "dashboard"
  | "processes"
  | "tasks"
  | "schedules"
  | "events"
  | "logs"
  | "resources"
  | "recovery";

const TABS: { id: Tab; label: string; icon: typeof Cpu }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "processes", label: "Processes", icon: ServerCog },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
  { id: "events", label: "Events", icon: Activity },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "resources", label: "Resources", icon: GaugeCircle },
  { id: "recovery", label: "Recovery", icon: History },
];

export function RuntimeView() {
  const workspacesQuery = useWorkspaceList();
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("dashboard");

  React.useEffect(() => {
    if (
      activeWorkspaceId === null &&
      workspacesQuery.data &&
      workspacesQuery.data.length > 0
    ) {
      setActiveWorkspaceId(workspacesQuery.data[0].id);
    }
  }, [activeWorkspaceId, workspacesQuery.data]);

  if (workspacesQuery.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (workspacesQuery.isError) {
    return (
      <EmptyState
        icon={Cpu}
        title="Couldn't load workspaces"
        description="Please try again later."
        className="m-4"
      />
    );
  }

  if (!workspacesQuery.data || workspacesQuery.data.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          icon={Cpu}
          title="Welcome to the Runtime"
          description="Create a workspace first to start managing runtime sessions, processes, tasks, and resources."
        />
      </div>
    );
  }

  const activeWorkspace =
    workspacesQuery.data.find((w) => w.id === activeWorkspaceId) ??
    workspacesQuery.data[0];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Cpu
            className="size-5 shrink-0 text-emerald-600"
            aria-hidden="true"
          />
          <select
            aria-label="Active workspace"
            value={activeWorkspace.id}
            onChange={(e) => {
              setActiveWorkspaceId(e.target.value);
              setActiveTab("dashboard");
            }}
            className="h-9 min-w-0 flex-1 max-w-xs truncate rounded-md border bg-background px-3 text-sm"
          >
            {workspacesQuery.data.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b bg-background/95 px-3 py-1.5 scrollbar-thin">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-emerald-600 text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {activeTab === "dashboard" ? (
          <RuntimeDashboard workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "processes" ? (
          <ProcessExplorer workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "tasks" ? (
          <TaskManager workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "schedules" ? (
          <ScheduleManager workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "events" ? (
          <EventViewer workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "logs" ? (
          <RuntimeLogs workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "resources" ? (
          <ResourceDashboard workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "recovery" ? (
          <RecoveryPanel workspaceId={activeWorkspace.id} />
        ) : null}
      </div>
    </div>
  );
}
