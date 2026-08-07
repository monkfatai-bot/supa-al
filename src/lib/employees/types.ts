/**
 * Supa AI — Phase 9C AI Employees — types.
 *
 * Domain-level types shared by the employee service layer, API routes,
 * and the client UI. These are intentionally plain TS types (no Zod, no
 * `server-only`) so the file is safe to import from client components
 * via the {@link "@/lib/employees/client"} barrel.
 *
 * The DB-level row shapes live in `@/lib/supabase/types` (`Tables<'...'>`).
 * The types here are the *service* shape — narrower column sets, friendly
 * camelCase field names, and discriminated unions for status enums.
 *
 * @module @/lib/employees/types
 */
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Status enums (mirrors the CHECK constraints in 0014_phase9c_employees.sql)
// ---------------------------------------------------------------------------

/** Lifecycle status of an `ai_employees` row. */
export type EmployeeStatus =
  | "active"
  | "paused"
  | "archived"
  | "training"
  | "busy";

/** Experience level drives the employee's autonomy + cost. */
export type ExperienceLevel = "junior" | "mid" | "senior" | "expert";

/** Memory type — see `employee_memory.memory_type` CHECK constraint. */
export type MemoryType =
  | "long-term"
  | "session"
  | "workspace"
  | "user-preference"
  | "task-history"
  | "knowledge-ref"
  | "learning";

/** Training source type — see `employee_training.source_type` CHECK. */
export type TrainingSourceType =
  | "document"
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "csv"
  | "json"
  | "website"
  | "knowledge-base"
  | "conversation";

/** Training status — see `employee_training.status` CHECK. */
export type TrainingStatus = "pending" | "processing" | "completed" | "failed";

/** Inter-employee message type — see `employee_messages.message_type`. */
export type EmployeeMessageType =
  | "message"
  | "task-delegation"
  | "escalation"
  | "handoff"
  | "context-share";

/** Marketplace rating range (1..5 inclusive, integer). */
export type MarketplaceRating = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// Row aliases — narrow re-exports of the canonical Supabase row shapes.
// ---------------------------------------------------------------------------

/** Full row of `ai_employees`. */
export type Employee = Tables<"ai_employees">;
/** Full row of `employee_skills`. */
export type EmployeeSkill = Tables<"employee_skills">;
/** Full row of `employee_memory`. */
export type EmployeeMemory = Tables<"employee_memory">;
/** Full row of `employee_training`. */
export type EmployeeTraining = Tables<"employee_training">;
/** Full row of `employee_departments`. */
export type EmployeeDepartment = Tables<"employee_departments">;
/** Full row of `employee_assignments`. */
export type EmployeeAssignment = Tables<"employee_assignments">;
/** Full row of `employee_performance`. */
export type EmployeePerformance = Tables<"employee_performance">;
/** Full row of `employee_messages`. */
export type EmployeeMessage = Tables<"employee_messages">;
/** Full row of `employee_marketplace`. */
export type EmployeeMarketplaceEntry = Tables<"employee_marketplace">;
/** Full row of `employee_versions`. */
export type EmployeeVersion = Tables<"employee_versions">;

/** Insert shape for `ai_employees` (used by the service). */
export type EmployeeInsert = TablesInsert<"ai_employees">;
/** Update shape for `ai_employees` (used by the service). */
export type EmployeeUpdate = TablesUpdate<"ai_employees">;
/** Insert shape for `employee_skills`. */
export type EmployeeSkillInsert = TablesInsert<"employee_skills">;
/** Update shape for `employee_skills`. */
export type EmployeeSkillUpdate = TablesUpdate<"employee_skills">;
/** Insert shape for `employee_memory`. */
export type EmployeeMemoryInsert = TablesInsert<"employee_memory">;
/** Update shape for `employee_memory`. */
export type EmployeeMemoryUpdate = TablesUpdate<"employee_memory">;
/** Insert shape for `employee_training`. */
export type EmployeeTrainingInsert = TablesInsert<"employee_training">;
/** Insert shape for `employee_messages`. */
export type EmployeeMessageInsert = TablesInsert<"employee_messages">;
/** Insert shape for `employee_performance`. */
export type EmployeePerformanceInsert = TablesInsert<"employee_performance">;
/** Insert shape for `employee_marketplace`. */
export type EmployeeMarketplaceInsert = TablesInsert<"employee_marketplace">;
/** Insert shape for `employee_versions`. */
export type EmployeeVersionInsert = TablesInsert<"employee_versions">;
/** Insert shape for `employee_assignments`. */
export type EmployeeAssignmentInsert = TablesInsert<"employee_assignments">;

// ---------------------------------------------------------------------------
// Service-level DTOs (input shapes accepted by the service methods)
// ---------------------------------------------------------------------------

/** Input accepted by `EmployeeService.create`. */
export interface CreateEmployeeInput {
  name: string;
  role: string;
  department?: string;
  description?: string | null;
  avatarUrl?: string | null;
  experienceLevel?: ExperienceLevel;
  systemPrompt?: string | null;
  permissions?: string[];
  tools?: string[];
  isTemplate?: boolean;
  isPublic?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `EmployeeService.update`. */
export interface UpdateEmployeeInput {
  name?: string;
  role?: string;
  department?: string;
  description?: string | null;
  avatarUrl?: string | null;
  status?: EmployeeStatus;
  experienceLevel?: ExperienceLevel;
  systemPrompt?: string | null;
  permissions?: string[];
  tools?: string[];
  isTemplate?: boolean;
  isPublic?: boolean;
  metadata?: Record<string, unknown> | null;
}

/** List options accepted by `EmployeeService.list`. */
export interface ListEmployeesOptions {
  search?: string;
  department?: string;
  status?: EmployeeStatus;
  isTemplate?: boolean;
  isPublic?: boolean;
  limit?: number;
  offset?: number;
}

/** Input accepted by `EmployeeService.addSkill`. */
export interface AddSkillInput {
  skillName: string;
  proficiency?: number;
  isPrimary?: boolean;
  config?: Record<string, unknown>;
}

/** Input accepted by `EmployeeService.updateSkill`. */
export interface UpdateSkillInput {
  proficiency?: number;
  isPrimary?: boolean;
  config?: Record<string, unknown>;
}

/** Input accepted by `EmployeeService.addMemory`. */
export interface AddMemoryInput {
  memoryType: MemoryType;
  key: string;
  value: unknown;
  importance?: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Input accepted by `EmployeeService.updateMemory`. */
export interface UpdateMemoryInput {
  memoryType?: MemoryType;
  key?: string;
  value?: unknown;
  importance?: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Options accepted by `EmployeeService.listMemory`. */
export interface ListMemoryOptions {
  type?: MemoryType;
  limit?: number;
}

/** Input accepted by `EmployeeService.sendMessage`. */
export interface SendMessageInput {
  content: string;
  messageType?: EmployeeMessageType;
  context?: Record<string, unknown> | null;
  parentId?: string | null;
}

/** Input accepted by `EmployeeService.delegateTask`. */
export interface DelegateTaskInput {
  content: string;
  context?: Record<string, unknown> | null;
  parentId?: string | null;
}

/** Input accepted by `EmployeeService.recordPerformance`. */
export interface RecordPerformanceInput {
  metricDate?: string;
  tasksCompleted?: number;
  tasksFailed?: number;
  successRate?: number;
  avgResponseMs?: number | null;
  creditsConsumed?: number;
  costCents?: number;
  totalTokens?: number;
  workflowParticipations?: number;
  userRating?: number | null;
  errorCount?: number;
  metadata?: Record<string, unknown> | null;
}

/** Options accepted by `EmployeeService.getPerformance`. */
export interface PerformanceOptions {
  dateFrom?: string;
  dateTo?: string;
}

/** Input accepted by `EmployeeService.publishToMarketplace`. */
export interface PublishToMarketplaceInput {
  title: string;
  description: string;
  category: string;
  tags?: string[];
  icon?: string | null;
  featured?: boolean;
  version?: string;
}

/** Options accepted by `EmployeeService.listMarketplace`. */
export interface ListMarketplaceOptions {
  category?: string;
  search?: string;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

/** Input accepted by `EmployeeService.trainFromUrl`. */
export interface TrainFromUrlInput {
  url: string;
  title?: string;
}

// ---------------------------------------------------------------------------
// Composite relation shape returned by `EmployeeService.get` / `listWithRelations`
// ---------------------------------------------------------------------------

/**
 * An employee with its first-level relations pre-fetched. Returned by
 * `EmployeeService.get` and `EmployeeService.list` (when `withRelations`
 * is implicitly true). Always populated — empty arrays when no rows
 * exist, never `null`.
 */
export interface EmployeeWithRelations extends Employee {
  skills: EmployeeSkill[];
  memory: EmployeeMemory[];
  training: EmployeeTraining[];
  assignments: EmployeeAssignment[];
  versions: EmployeeVersion[];
}

// ---------------------------------------------------------------------------
// Chat result shape returned by `EmployeeService.chat`
// ---------------------------------------------------------------------------

/**
 * Result of an AI employee chat turn. The `usage` field is populated
 * when the underlying AI provider returns token counts (best-effort —
 * some providers omit usage metadata on certain endpoints).
 */
export interface EmployeeChatResult {
  response: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Employee id the chat was scoped to. */
  employeeId: string;
  /** Provider + model that produced the response (for transparency). */
  provider?: string;
  model?: string;
}

// ---------------------------------------------------------------------------
// Manager dashboard aggregate shape
// ---------------------------------------------------------------------------

/**
 * Per-department breakdown row returned by `EmployeeService.getDashboard`.
 */
export interface DepartmentBreakdown {
  department: string;
  label: string;
  icon: string | null;
  color: string | null;
  employeeCount: number;
  activeCount: number;
  tasksCompleted: number;
  avgSuccessRate: number;
  creditsConsumed: number;
}

/** A top-performer row returned by `EmployeeService.getDashboard`. */
export interface TopPerformerEntry {
  employeeId: string;
  name: string;
  role: string;
  department: string;
  avatarUrl: string | null;
  tasksCompleted: number;
  successRate: number;
  creditsConsumed: number;
  userRating: number | null;
}

/** Aggregate shape returned by `EmployeeService.getDashboard`. */
export interface EmployeeDashboardSummary {
  totalEmployees: number;
  activeEmployees: number;
  pausedEmployees: number;
  archivedEmployees: number;
  totalTasks: number;
  totalFailedTasks: number;
  avgSuccessRate: number;
  totalCreditsConsumed: number;
  totalCostCents: number;
  totalTokens: number;
  byDepartment: DepartmentBreakdown[];
  topPerformers: TopPerformerEntry[];
}

/** Input accepted by `EmployeeService.createVersion`. */
export interface CreateVersionInput {
  changelog?: string | null;
}
