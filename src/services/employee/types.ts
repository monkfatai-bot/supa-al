/**
 * AI Employee service type definitions.
 */

// ─── Re-export DB types ───────────────────────────────────

import type {
  EmployeeStatus,
  EmployeeExperienceLevel,
  EmployeeMemoryScope,
  EmployeeTrainingType,
  EmployeeTrainingStatus,
  EmployeeAssignmentType,
  EmployeeAssignmentStatus,
  AiEmployee,
  EmployeeSkill,
  EmployeeMemory,
  EmployeeTraining,
  EmployeeDepartment,
  EmployeeAssignment,
  EmployeePerformance,
  EmployeeMessage,
  EmployeeMarketplace,
  EmployeeVersion,
  Json,
} from "@/types/generated/database";

export type {
  Json,
  EmployeeStatus,
  EmployeeExperienceLevel,
  EmployeeMemoryScope,
  EmployeeTrainingType,
  EmployeeTrainingStatus,
  EmployeeAssignmentType,
  EmployeeAssignmentStatus,
  AiEmployee,
  EmployeeSkill,
  EmployeeMemory,
  EmployeeTraining,
  EmployeeDepartment,
  EmployeeAssignment,
  EmployeePerformance,
  EmployeeMessage,
  EmployeeMarketplace,
  EmployeeVersion,
};

// ─── Request Types ──────────────────────────────────────────

export interface CreateEmployeeRequest {
  name: string;
  role: string;
  department: string;
  description?: string;
  bio?: string;
  skills?: string[];
  responsibilities?: string[];
  experience_level?: EmployeeExperienceLevel;
  avatar_url?: string;
  tags?: string[];
}

export interface UpdateEmployeeRequest {
  name?: string;
  role?: string;
  department?: string;
  description?: string;
  bio?: string;
  skills?: string[];
  responsibilities?: string[];
  supported_tools?: string[];
  permissions?: string[];
  experience_level?: EmployeeExperienceLevel;
  avatar_url?: string;
  tags?: string[];
  metadata?: Json;
}

export interface AddSkillRequest {
  skill_name: string;
  skill_category?: string;
  proficiency_level?: number;
}

export interface AddMemoryRequest {
  scope: EmployeeMemoryScope;
  category?: string;
  content: string;
  metadata?: Json;
  workspace_id?: string;
}

export interface AddTrainingRequest {
  training_type: EmployeeTrainingType;
  source_name: string;
  source_url?: string;
  content?: string;
}

export interface RecordPerformanceMetrics {
  tasks_completed?: number;
  tasks_failed?: number;
  avg_response_time_ms?: number;
  ai_credits_used?: number;
  user_rating?: number;
  period_start: string;
  period_end: string;
}

// ─── Enriched Models ───────────────────────────────────────

export interface EmployeeWithSkills {
  employee: AiEmployee;
  skills: EmployeeSkill[];
}

export interface EmployeeFullProfile {
  employee: AiEmployee;
  skills: EmployeeSkill[];
  assignments: EmployeeAssignment[];
  performance: EmployeePerformance[];
  departments: EmployeeDepartment[];
}

// ─── List Options ─────────────────────────────────────────

export interface EmployeeListOptions {
  page?: number;
  pageSize?: number;
  department?: string;
  status?: string;
  search?: string;
  sort?: string;
}

export interface EmployeeDirectoryOptions {
  page?: number;
  pageSize?: number;
  department?: string;
  status?: string;
  search?: string;
  sort?: string;
}

export interface MarketplaceListOptions {
  page?: number;
  pageSize?: number;
  category?: string;
  search?: string;
  featured?: boolean;
}

// ─── Dashboard Stats ───────────────────────────────────────

export interface EmployeeDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  totalTasksCompleted: number;
  avgRating: number;
  topDepartment: string;
  totalCreditsUsed: number;
}

// ─── Paginated Response ────────────────────────────────────

export interface PaginatedEmployeeResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Action Response ───────────────────────────────────────

export interface EmployeeActionResponse {
  success: boolean;
  message: string;
  error?: string;
}
