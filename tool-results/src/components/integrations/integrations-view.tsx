"use client";

/**
 * Supa AI — Phase 10 Integration Hub — main view.
 *
 * 6-tab container that composes every integration sub-component into a
 * single full-height surface:
 *
 *   - Marketplace tab: {@link MarketplaceBrowser}.
 *   - Installed tab: {@link InstalledApps}.
 *   - Health tab: {@link HealthDashboard}.
 *   - Logs tab: {@link IntegrationLogs}.
 *   - Analytics tab: {@link AnalyticsDashboard}.
 *   - Webhooks tab: {@link WebhookConfig}.
 *
 * Owns the active-workspace state (resolved from the `useWorkspaces`
 * hook) and passes it down to the sub-components.
 *
 * @module @/components/integrations/integrations-view
 */
import * as React from "react";
import {
  Activity,
  BarChart3,
  Plug,
  Store,
  Webhook,
  Heart,
  ScrollText,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaces as useWorkspaceList } from "@/hooks/use-workspace";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import { MarketplaceBrowser } from "./marketplace-browser";
import { InstalledApps } from "./installed-apps";
import { HealthDashboard } from "./health-dashboard";
import { IntegrationLogs } from "./integration-logs";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { WebhookConfig } from "./webhook-config";

type Tab =
  | "marketplace"
  | "installed"
  | "health"
  | "logs"
  | "analytics"
  | "webhooks";

const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "marketplace", label: "Marketplace", icon: Store },
  { id: "installed", label: "Installed", icon: Plug },
  { id: "health", label: "Health", icon: Heart },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
];

export function IntegrationsView() {
  const workspacesQuery = useWorkspaceList();
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("marketplace");

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
        icon={Activity}
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
          icon={Plug}
          title="Welcome to Integrations"
          description="Create a workspace first to start connecting apps — Slack, GitHub, Stripe, OpenAI, and 25+ more."
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
          <Plug
            className="size-5 shrink-0 text-emerald-500"
            aria-hidden="true"
          />
          <select
            aria-label="Active workspace"
            value={activeWorkspace.id}
            onChange={(e) => {
              setActiveWorkspaceId(e.target.value);
              setActiveTab("marketplace");
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
                ? "bg-primary text-primary-foreground"
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
        {activeTab === "marketplace" ? (
          <MarketplaceBrowser workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "installed" ? (
          <InstalledApps workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "health" ? (
          <HealthDashboard workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "logs" ? (
          <IntegrationLogs workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "analytics" ? (
          <AnalyticsDashboard workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "webhooks" ? (
          <WebhookConfig workspaceId={activeWorkspace.id} />
        ) : null}
      </div>
    </div>
  );
}
