"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Calendar,
  Filter,
  Loader2,
  AlertCircle,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTasks, moveTask, getProjects } from "@/services/project";
import type {
  TaskWithAssignee,
  TaskStatus,
  TaskPriority,
  ProjectWithProgress,
} from "@/services/project";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "todo", label: "Todo", color: "bg-slate-100 dark:bg-slate-900" },
  { status: "in_progress", label: "In Progress", color: "bg-blue-50 dark:bg-blue-950" },
  { status: "in_review", label: "In Review", color: "bg-amber-50 dark:bg-amber-950" },
  { status: "done", label: "Done", color: "bg-green-50 dark:bg-green-950" },
];

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  low: { label: "Low", variant: "outline" },
  medium: { label: "Medium", variant: "secondary" },
  high: { label: "High", variant: "default" },
  urgent: { label: "Urgent", variant: "destructive" },
};

function getPreviousStatus(status: TaskStatus): TaskStatus | null {
  const order: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
  const idx = order.indexOf(status);
  return idx > 0 ? order[idx - 1] : null;
}

function getNextStatus(status: TaskStatus): TaskStatus | null {
  const order: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
  const idx = order.indexOf(status);
  return idx < order.length - 1 ? order[idx + 1] : null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProjectBoardProps {
  workspaceId: string;
  projectId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProjectBoard({ workspaceId, projectId }: ProjectBoardProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<TaskWithAssignee[]>([]);
  const [projects, setProjects] = useState<ProjectWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  // Filters
  const [filterProject, setFilterProject] = useState(projectId ?? "all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // ── Fetch tasks ─────────────────────────────────────────────────────────
  const fetchTasks = useCallback(() => {
    setLoading(true);
    setError("");

    const filters: Parameters<typeof getTasks>[1] = {
      pageSize: 100,
    };

    if (projectId) {
      filters.projectId = projectId;
    }
    if (filterProject && filterProject !== "all") {
      filters.projectId = filterProject;
    }
    if (filterPriority && filterPriority !== "all") {
      filters.priority = filterPriority as TaskPriority;
    }
    if (filterAssignee && filterAssignee !== "all") {
      filters.assigneeId = filterAssignee;
    }

    // Fetch multiple pages for full workspace view
    Promise.all([
      getTasks(workspaceId, filters),
      getTasks(workspaceId, { ...filters, page: 2, pageSize: 100 }),
      getTasks(workspaceId, { ...filters, page: 3, pageSize: 100 }),
    ]).then(([p1, p2, p3]) => {
      const all = [...p1.tasks, ...p2.tasks, ...p3.tasks];
      setTasks(all);
      setLoading(false);
    });
  }, [workspaceId, projectId, filterProject, filterPriority, filterAssignee]);

  // ── Fetch projects (for filter dropdown) ────────────────────────────────
  const fetchProjects = useCallback(() => {
    getProjects(workspaceId, { pageSize: 50 }).then((res) => {
      setProjects(res.projects);
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks();
  }, [fetchTasks]);

  // ── Unique assignees from loaded tasks ───────────────────────────────────
  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
    tasks.forEach((t) => {
      if (t.assignee_id && t.assignee) {
        map.set(t.assignee_id, {
          id: t.assignee_id,
          name: t.assignee.full_name ?? "Unknown",
          avatarUrl: t.assignee.avatar_url,
        });
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  // ── Group tasks by status ───────────────────────────────────────────────
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskWithAssignee[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      cancelled: [],
    };
    tasks.forEach((t) => {
      if (grouped[t.status]) {
        grouped[t.status].push(t);
      }
    });
    return grouped;
  }, [tasks]);

  // ── Stats ───────────────────────────────────────────────────────────────
  const activeTaskCount = tasks.filter((t) => t.status !== "cancelled").length;
  const doneTaskCount = tasksByStatus.done.length;
  const completionRate =
    activeTaskCount > 0
      ? Math.round((doneTaskCount / activeTaskCount) * 100)
      : 0;

  // ── Move task ───────────────────────────────────────────────────────────
  async function handleMoveTask(taskId: string, newStatus: TaskStatus) {
    setMovingTaskId(taskId);
    const res = await moveTask(taskId, workspaceId, { status: newStatus });
    if (!res.success) {
      setError(res.message);
    }
    setMovingTaskId(null);
    // Refetch to get updated data
    fetchTasks();
  }

  // ── Format due date ─────────────────────────────────────────────────────
  function formatDueDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const isOverdue = d < now;
    const formatted = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return isOverdue ? `${formatted} (overdue)` : formatted;
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
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
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Task Board</h2>
          <Badge variant="outline" className="text-xs">
            {activeTaskCount} tasks
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {completionRate}% complete
          </Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-1.5 h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Total: </span>
          <span className="font-medium">{activeTaskCount}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Todo: </span>
          <span className="font-medium">{tasksByStatus.todo.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">In Progress: </span>
          <span className="font-medium">{tasksByStatus.in_progress.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">In Review: </span>
          <span className="font-medium">{tasksByStatus.in_review.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Done: </span>
          <span className="font-medium tabular-nums">{doneTaskCount}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <div className="min-w-[180px]">
              <label className="mb-1.5 block text-sm font-medium">
                Project
              </label>
              <Select
                value={filterProject}
                onValueChange={setFilterProject}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px]">
              <label className="mb-1.5 block text-sm font-medium">
                Priority
              </label>
              <Select
                value={filterPriority}
                onValueChange={setFilterPriority}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
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

            <div className="min-w-[180px]">
              <label className="mb-1.5 block text-sm font-medium">
                Assignee
              </label>
              <Select
                value={filterAssignee}
                onValueChange={setFilterAssignee}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {uniqueAssignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const columnTasks = tasksByStatus[col.status] ?? [];
          return (
            <div
              key={col.status}
              className={`min-w-[280px] flex-1 rounded-lg p-3 ${col.color}`}
            >
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <Badge
                    variant="secondary"
                    className="h-5 min-w-[20px] justify-center px-1.5 text-xs"
                  >
                    {columnTasks.length}
                  </Badge>
                </div>
              </div>

              {/* Task Cards */}
              <div className="space-y-2">
                {columnTasks.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No tasks
                  </p>
                )}

                {columnTasks.map((task) => {
                  const prevStatus = getPreviousStatus(task.status);
                  const nextStatus = getNextStatus(task.status);
                  const priorityCfg = PRIORITY_CONFIG[task.priority];
                  const isMoving = movingTaskId === task.id;
                  const dueDateStr = formatDueDate(task.due_date);
                  const isOverdue =
                    task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";

                  return (
                    <Card
                      key={task.id}
                      className="group"
                    >
                      <CardContent className="space-y-2.5 p-3">
                        {/* Title + Priority */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium leading-snug">
                            {task.title}
                          </h4>
                          <Badge
                            variant={priorityCfg.variant}
                            className="shrink-0 text-[10px]"
                          >
                            {priorityCfg.label}
                          </Badge>
                        </div>

                        {/* Assignee */}
                        {task.assignee && (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarImage
                                src={task.assignee.avatar_url ?? undefined}
                              />
                              <AvatarFallback className="text-[8px]">
                                <User className="h-3 w-3" />
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">
                              {task.assignee.full_name ?? "Unknown"}
                            </span>
                          </div>
                        )}

                        {/* Due Date */}
                        {dueDateStr && (
                          <div
                            className={`flex items-center gap-1.5 text-xs ${
                              isOverdue
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            {dueDateStr}
                          </div>
                        )}

                        {/* Project Name */}
                        {task.project && (
                          <span className="text-[10px] text-muted-foreground">
                            {task.project.name}
                          </span>
                        )}

                        {/* Move Buttons */}
                        <div className="flex items-center justify-between pt-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={!prevStatus || isMoving}
                            onClick={() =>
                              prevStatus &&
                              handleMoveTask(task.id, prevStatus)
                            }
                          >
                            {isMoving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ChevronLeft className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={!nextStatus || isMoving}
                            onClick={() =>
                              nextStatus &&
                              handleMoveTask(task.id, nextStatus)
                            }
                          >
                            {isMoving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
