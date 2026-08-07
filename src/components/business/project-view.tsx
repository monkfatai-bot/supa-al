"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — Projects view.
 *
 * The project list surface. Composes:
 *
 *   - A search input (debounced via React's `useDeferredValue`) that
 *     matches project name + description server-side.
 *   - A status filter dropdown (`planning`, `active`, `on-hold`,
 *     `completed`, …).
 *   - A "New project" button that opens a creation dialog.
 *   - A responsive grid of project cards showing name, status, dates,
 *     budget, progress bar, and description.
 *
 * The view is purely presentational on top of {@link useProjects} +
 * {@link useCreateProject} from {@link @/hooks/use-business}.
 *
 * @module @/components/business/project-view
 */
import * as React from "react";
import { FolderKanban, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Project, ProjectStatus } from "@/lib/business/client";
import {
  useCreateProject,
  useProjects,
} from "@/hooks/use-business";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils/index";

/** Project-status → badge palette. */
const STATUS_BADGE: Record<ProjectStatus, string> = {
  planning:
    "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
  active:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "on-hold":
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  completed:
    "border-transparent bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  cancelled:
    "border-transparent bg-muted text-muted-foreground line-through",
  archived: "border-transparent bg-muted text-muted-foreground",
};

const STATUS_OPTIONS: { value: ProjectStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on-hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "archived", label: "Archived" },
];

export interface ProjectViewProps {
  workspaceId: string;
  className?: string;
}

export function ProjectView({ workspaceId, className }: ProjectViewProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus | "all">("all");
  const debouncedSearch = React.useDeferredValue(search);

  const projectsQuery = useProjects(workspaceId, {
    search: debouncedSearch || undefined,
    status: status === "all" ? undefined : status,
    limit: 100,
  });

  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className={cn("space-y-4 p-4 sm:p-6 lg:p-8", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Projects
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage client projects — track status, budget, and progress.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="size-4" /> New project
        </Button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search projects by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as ProjectStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {projectsQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : projectsQuery.isError ? (
        <EmptyState
          icon={FolderKanban}
          title="Couldn't load projects"
          description="Please try again later."
        />
      ) : (projectsQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first project to start tracking scope, budget, and milestones."
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="size-4" /> New project
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(projectsQuery.data ?? []).map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{project.name}</CardTitle>
            <CardDescription className="truncate text-xs">
              {project.start_date ? formatDate(project.start_date) : "Not started"}
              {project.end_date
                ? ` → ${formatDate(project.end_date)}`
                : ""}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn("capitalize", STATUS_BADGE[project.status as ProjectStatus] ?? "")}
          >
            {project.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {project.description}
          </p>
        ) : null}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Progress</span>
            <span className="tabular-nums">{Math.round(project.progress)}%</span>
          </div>
          <Progress value={project.progress} className="h-1.5" />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Budget</span>
          <span className="tabular-nums">
            {formatCurrency(project.budget, "USD")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<ProjectStatus>("planning");
  const [budget, setBudget] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const mutation = useCreateProject();
  const { toast } = useToast();

  const reset = React.useCallback(() => {
    setName("");
    setDescription("");
    setStatus("planning");
    setBudget("");
    setStartDate("");
    setEndDate("");
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      await mutation.mutateAsync({
        workspaceId,
        input: {
          name: name.trim(),
          description: description.trim() || null,
          status,
          startDate: startDate || null,
          endDate: endDate || null,
          budget: budget ? Number(budget) : 0,
        },
      });
      toast({ title: "Project created" });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to create project",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [
    budget,
    description,
    endDate,
    mutation,
    name,
    onOpenChange,
    reset,
    startDate,
    status,
    toast,
    workspaceId,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="size-4" /> New project
          </DialogTitle>
          <DialogDescription>
            Create a new project record — you can add team members and tasks later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Name *</Label>
            <Input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Q4 marketing campaign"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-paragraph brief"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProjectStatus)}
              >
                <SelectTrigger id="proj-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on-hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-budget">Budget (USD)</Label>
              <Input
                id="proj-budget"
                type="number"
                min="0"
                step="100"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="proj-start">Start date</Label>
              <Input
                id="proj-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-end">End date</Label>
              <Input
                id="proj-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
