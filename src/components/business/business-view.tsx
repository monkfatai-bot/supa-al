"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — main view.
 *
 * Tabbed container that composes every business sub-component into a
 * single full-height surface:
 *
 *   - Dashboard tab: {@link ReportView} — KPI stats + revenue chart.
 *   - CRM tab: {@link CrmView} — customer list + create dialog.
 *   - Invoices tab: {@link InvoiceView} — invoice table + create dialog.
 *   - Projects tab: {@link ProjectView} — project cards + create dialog.
 *   - Calendar tab: {@link CalendarView} — chronological event list.
 *   - Reports tab: {@link ReportView} — full reports surface.
 *   - AI Assistant tab: {@link AiAssistantView} — chat-style assistant.
 *
 * Owns the active-workspace state (resolved from the `useWorkspaces`
 * hook) and the active-tab state (local). If no workspaces exist, the
 * view renders an empty state prompting the user to create one.
 *
 * @module @/components/business/business-view
 */
import * as React from "react";
import {
  Briefcase,
  Calendar as CalendarIcon,
  FileText,
  LayoutDashboard,
  PieChart,
  Sparkles,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaces as useWorkspaceList } from "@/hooks/use-workspace";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

import { AiAssistantView } from "./ai-assistant-view";
import { CalendarView } from "./calendar-view";
import { CrmView } from "./crm-view";
import { InvoiceView } from "./invoice-view";
import { ProjectView } from "./project-view";
import { ReportView } from "./report-view";

type Tab =
  | "dashboard"
  | "crm"
  | "invoices"
  | "projects"
  | "calendar"
  | "reports"
  | "assistant";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "crm", label: "CRM", icon: Users },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "projects", label: "Projects", icon: Briefcase },
  { id: "calendar", label: "Calendar", icon: CalendarIcon },
  { id: "reports", label: "Reports", icon: PieChart },
  { id: "assistant", label: "AI Assistant", icon: Sparkles },
];

export function BusinessView() {
  const workspacesQuery = useWorkspaceList();
  const [activeWorkspaceId, setActiveWorkspaceId] =
    React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("dashboard");

  // Pick the first workspace once the list loads.
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
        icon={Briefcase}
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
          icon={Briefcase}
          title="Welcome to Business Tools"
          description="Create a workspace first to start managing customers, invoices, projects, and reports."
        />
      </div>
    );
  }

  const activeWorkspace =
    workspacesQuery.data.find((w) => w.id === activeWorkspaceId) ??
    workspacesQuery.data[0];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar with tabs */}
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-thin">
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
              <tab.icon className="size-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && (
          <ReportView workspaceId={activeWorkspace.id} />
        )}
        {activeTab === "crm" && <CrmView workspaceId={activeWorkspace.id} />}
        {activeTab === "invoices" && (
          <InvoiceView workspaceId={activeWorkspace.id} />
        )}
        {activeTab === "projects" && (
          <ProjectView workspaceId={activeWorkspace.id} />
        )}
        {activeTab === "calendar" && (
          <CalendarView workspaceId={activeWorkspace.id} />
        )}
        {activeTab === "reports" && (
          <ReportView workspaceId={activeWorkspace.id} />
        )}
        {activeTab === "assistant" && (
          <AiAssistantView workspaceId={activeWorkspace.id} />
        )}
      </div>
    </div>
  );
}
