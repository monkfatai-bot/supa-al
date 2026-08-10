"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  FolderKanban,
  Calendar,
  DollarSign,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getProjects,
  createProject,
} from "@/services/project";
import type {
  ProjectWithProgress,
  ProjectStatus,
  TaskPriority,
} from "@/services/project";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  planning: "outline",
  active: "default",
  on_hold: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};
// ── Props ─────────────────────────────────────────────────────────────────────

interface ProjectListProps {
  workspaceId: string;
  onProjectClick?: (projectId: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProjectList({ workspaceId, onProjectClick }: ProjectListProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState<ProjectWithProgress[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Add Project dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [creating, setCreating] = useState(false);

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── Fetch projects ─────────────────────────────────────────────────────
  const fetchProjects = useCallback(() => {
    setLoading(true);
    setError("");

    const filters: Parameters<typeof getProjects>[1] = {
      page,
      pageSize,
    };

    if (filterStatus && filterStatus !== "all") {
      filters.status = filterStatus as ProjectStatus;
    }
    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    getProjects(workspaceId, filters).then((res) => {
      setProjects(res.projects);
      setTotal(res.total);
      setLoading(false);
    });
  }, [workspaceId, page, filterStatus, searchQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProjects();
  }, [fetchProjects]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [filterStatus, filterPriority, searchQuery]);

  // ── Create project ──────────────────────────────────────────────────────
  async function handleCreateProject() {
    if (!newName.trim()) {
      setError("Project name is required.");
      return;
    }

    setCreating(true);
    setError("");

    const res = await createProject({
      workspaceId,
      name: newName.trim(),
      description: newDescription.trim() || undefined,
      priority: newPriority,
    });

    if (!res.success) {
      setError(res.message);
    } else {
      setAddDialogOpen(false);
      setNewName("");
      setNewDescription("");
      setNewPriority("medium");
      fetchProjects();
    }

    setCreating(false);
  }

  // ── Filtered projects (client-side priority filter since API doesn't support it) ──
  const displayProjects =
    filterPriority === "all"
      ? projects
      : projects.filter((p) => p.priority === filterPriority);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading && projects.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Projects</h2>
          <Badge variant="outline" className="text-xs">
            {total} project{total !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === "card" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-r-none"
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-l-none"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          {/* Add Project Dialog */}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Project Name
                  </label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Website Redesign"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Description
                  </label>
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Brief description (optional)"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    Priority
                  </label>
                  <Select
                    value={newPriority}
                    onValueChange={(v) =>
                      setNewPriority(v as TaskPriority)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateProject}
                    disabled={creating || !newName.trim()}
                  >
                    {creating ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="pl-9"
          />
        </div>

        <Select
          value={filterStatus}
          onValueChange={setFilterStatus}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="planning">Planning</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterPriority}
          onValueChange={setFilterPriority}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty State */}
      {!loading && displayProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <FolderKanban className="mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="mb-1 text-sm font-medium">No projects found</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            {searchQuery || filterStatus !== "all" || filterPriority !== "all"
              ? "Try adjusting your filters."
              : "Create your first project to get started."}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            New Project
          </Button>
        </div>
      )}

      {/* Card View */}
      {viewMode === "card" && displayProjects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayProjects.map((project) => {
            const progressPercent =
              project.taskCount > 0
                ? Math.round(
                    (project.completedTaskCount / project.taskCount) * 100
                  )
                : 0;

            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => onProjectClick?.(project.id)}
              >
                <CardContent className="space-y-3 p-4">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">
                      {project.name}
                    </h3>
                    <Badge
                      variant={STATUS_VARIANT[project.status] ?? "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {project.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {/* Description */}
                  {project.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  )}

                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium tabular-nums">
                        {progressPercent}%
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                    <p className="text-[10px] text-muted-foreground">
                      {project.completedTaskCount}/{project.taskCount} tasks
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    {project.start_date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(project.start_date).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" }
                        )}
                      </div>
                    )}
                    {project.budget > 0 && (
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {project.budget.toLocaleString()}
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {project.priority}
                    </div>
                  </div>

                  {/* Assignee */}
                  {project.assigned_to && (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px]">
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        Assigned
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && displayProjects.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Progress</TableHead>
                <TableHead className="hidden lg:table-cell">Tasks</TableHead>
                <TableHead className="hidden lg:table-cell">Budget</TableHead>
                <TableHead className="hidden xl:table-cell">Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayProjects.map((project) => {
                const progressPercent =
                  project.taskCount > 0
                    ? Math.round(
                        (project.completedTaskCount / project.taskCount) * 100
                      )
                    : 0;

                return (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => onProjectClick?.(project.id)}
                  >
                    <TableCell>
                      <div className="font-medium">{project.name}</div>
                      {project.description && (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                          {project.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge
                        variant={STATUS_VARIANT[project.status] ?? "outline"}
                        className="text-xs"
                      >
                        {project.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={progressPercent}
                          className="h-2 w-16"
                        />
                        <span className="text-xs tabular-nums">
                          {progressPercent}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-sm tabular-nums">
                        {project.completedTaskCount}/{project.taskCount}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {project.budget > 0
                        ? `$${project.budget.toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {project.end_date
                        ? new Date(project.end_date).toLocaleDateString(
                            "en-US",
                            { month: "short", day: "numeric" }
                          )
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} projects)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
