"use client";

/**
 * Supa AI — Phase 9A Automation — main view.
 *
 * Tabbed container that composes every automation sub-component into a
 * single full-height surface:
 *
 *   - Workflows tab: {@link WorkflowList}.
 *   - Runs tab: {@link RunList} for the active workspace.
 *   - Templates tab: {@link TemplateLibrary}.
 *   - Dashboard tab: {@link AutomationDashboard}.
 *
 * Owns the active-workspace state (resolved from the `useWorkspaces`
 * hook) and passes it down to the sub-components.
 *
 * @module @/components/automation/automation-view
 */
import * as React from "react";
import {
  Activity,
  LayoutDashboard,
  Sparkles,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { AutomationTemplate, WorkflowRun } from "@/lib/automation/client";
import { useWorkspaces as useWorkspaceList } from "@/hooks/use-workspace";
import {
  useCreateWorkflow,
  useRunLogs,
  useStartRun,
  useWorkflows,
} from "@/hooks/use-automation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { WorkflowList } from "./workflow-list";
import { RunList } from "./run-list";
import { TemplateLibrary } from "./template-library";
import { AutomationDashboard } from "./automation-dashboard";

type Tab = "workflows" | "runs" | "templates" | "dashboard";

const TABS: { id: Tab; label: string; icon: typeof Zap }[] = [
  { id: "workflows", label: "Workflows", icon: Zap },
  { id: "runs", label: "Runs", icon: Activity },
  { id: "templates", label: "Templates", icon: Sparkles },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function AutomationView() {
  const workspacesQuery = useWorkspaceList();
  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      activeWorkspaceId === null &&
      workspacesQuery.data &&
      workspacesQuery.data.length > 0
    ) {
      setActiveWorkspaceId(workspacesQuery.data[0].id);
    }
  }, [activeWorkspaceId, workspacesQuery.data]);

  const [activeTab, setActiveTab] = React.useState<Tab>("workflows");

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
        icon={Zap}
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
          icon={Zap}
          title="Welcome to Automation"
          description="Create a workspace first to start building automations — workflows, triggers, actions, and webhooks."
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
          <Zap
            className="size-5 shrink-0 text-blue-500"
            aria-hidden="true"
          />
          <select
            aria-label="Active workspace"
            value={activeWorkspace.id}
            onChange={(e) => {
              setActiveWorkspaceId(e.target.value);
              setActiveTab("workflows");
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
        {activeTab === "workflows" ? (
          <WorkflowsPane workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "runs" ? (
          <RunsPane workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "templates" ? (
          <TemplatesPane workspaceId={activeWorkspace.id} />
        ) : null}
        {activeTab === "dashboard" ? (
          <AutomationDashboard workspaceId={activeWorkspace.id} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflows pane
// ---------------------------------------------------------------------------

interface WorkflowsPaneProps {
  workspaceId: string;
}

function WorkflowsPane({ workspaceId }: WorkflowsPaneProps) {
  const createMutation = useCreateWorkflow();
  const startRunMutation = useStartRun();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");

  const handleCreate = React.useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await createMutation.mutateAsync({
        workspaceId,
        input: {
          name: newName.trim(),
          description: newDescription || null,
          status: "draft",
        },
      });
      toast({ title: "Workflow created" });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
    } catch (err) {
      toast({
        title: "Failed to create workflow",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createMutation, workspaceId, newName, newDescription, toast]);

  const handleRun = React.useCallback(
    async (workflow: { id: string }) => {
      try {
        await startRunMutation.mutateAsync({ workflowId: workflow.id });
        toast({ title: "Run started" });
      } catch (err) {
        toast({
          title: "Failed to start run",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [startRunMutation, toast],
  );

  return (
    <>
      <WorkflowList
        workspaceId={workspaceId}
        onCreate={() => setCreateOpen(true)}
        onRun={handleRun}
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Workflow name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Textarea
              placeholder="Description (optional)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Runs pane
// ---------------------------------------------------------------------------

interface RunsPaneProps {
  workspaceId: string;
}

function RunsPane({ workspaceId }: RunsPaneProps) {
  // The Runs tab shows the most recently-touched workflow's runs, or a
  // friendly picker when there are multiple workflows. For Phase 9A the
  // simplest honest UX is to fetch the workflows list and show the most
  // recent one's runs — the user can switch from the workflows tab.
  const workflowsQuery = useWorkflows(workspaceId, { limit: 1 });
  const [activeWorkflowId, setActiveWorkflowId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      activeWorkflowId === null &&
      workflowsQuery.data &&
      workflowsQuery.data.length > 0
    ) {
      setActiveWorkflowId(workflowsQuery.data[0].id);
    }
  }, [activeWorkflowId, workflowsQuery.data]);

  if (workflowsQuery.isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!workflowsQuery.data || workflowsQuery.data.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No workflows yet"
        description="Create a workflow first — its runs will show up here."
      />
    );
  }

  const workflowId = activeWorkflowId ?? workflowsQuery.data[0].id;

  return (
    <RunList
      workspaceId={workspaceId}
      workflowId={workflowId}
    />
  );
}

// ---------------------------------------------------------------------------
// Templates pane
// ---------------------------------------------------------------------------

interface TemplatesPaneProps {
  workspaceId: string;
}

function TemplatesPane({ workspaceId }: TemplatesPaneProps) {
  const { toast } = useToast();
  // Install a template by creating a workflow from its config —
  // Phase 9A ships a client-side stub that issues a `useCreateWorkflow`
  // mutation with the template's config. (A dedicated `installTemplate`
  // server route will follow.)
  const createWorkflow = useCreateWorkflow();

  const handleInstall = React.useCallback(
    async (template: AutomationTemplate) => {
      try {
        const cfg = (template.config as Record<string, unknown> | null) ?? {};
        await createWorkflow.mutateAsync({
          workspaceId,
          input: {
            name: template.name,
            description: template.description,
            status: "draft",
            config: cfg,
          },
        });
        toast({
          title: "Template installed",
          description: `A new draft workflow was created from "${template.name}".`,
        });
      } catch (err) {
        toast({
          title: "Failed to install template",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [createWorkflow, workspaceId, toast],
  );

  return <TemplateLibrary onInstall={handleInstall} />;
}

// Re-exported for callers that need the run type alongside the view.
export type { WorkflowRun };
