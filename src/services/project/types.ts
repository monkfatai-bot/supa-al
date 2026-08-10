import type {
  Project,
  ProjectMilestone,
  Task,
} from "@/types/generated/database";
import type { ProjectStatus, TaskPriority, TaskStatus } from "@/types/generated/database";

// ─── Request DTOs ──────────────────────────────────────────────

export interface CreateProjectRequest {
  workspaceId: string;
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: TaskPriority;
  startDate?: string;
  endDate?: string;
  budget?: number;
  assignedTo?: string;
  tags?: string[];
}

export interface CreateMilestoneRequest {
  projectId: string;
  name: string;
  description?: string;
  dueDate?: string;
  sortOrder?: number;
}

export interface CreateTaskRequest {
  workspaceId: string;
  projectId?: string;
  milestoneId?: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTaskStatusRequest {
  status: TaskStatus;
  startedAt?: string;
  completedAt?: string;
}

// ─── Composite response types ──────────────────────────────────

export interface ProjectWithProgress extends Project {
  taskCount: number;
  completedTaskCount: number;
  milestones?: ProjectMilestone[];
}

export interface TaskWithAssignee extends Task {
  assignee?: {
    full_name: string | null;
    avatar_url: string | null;
  };
  project?: {
    name: string;
  };
}

export interface ProjectDashboardStats {
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  upcomingDeadlines: Task[];
}

// ─── Re-exports for convenience ────────────────────────────────

export type { Project, ProjectMilestone, Task, ProjectStatus, TaskPriority, TaskStatus };
