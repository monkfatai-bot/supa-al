/**
 * Automation Engine type system.
 * Defines all interfaces for workflows, triggers, actions, execution, and scheduling.
 */

// ─── Re-export DB types ───────────────────────────────────

import type {
  WorkflowStatus,
  WorkflowRunStatus,
  TriggerType,
  ActionType,
  ExecutionMode,
  ScheduleType,
  ScheduledJobStatus,
  LogLevel,
  VariableScope,
  ConditionOperator,
  TemplateCategory,
  Workflow,
  WorkflowVersion,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowRun,
  WorkflowLog,
  WorkflowVariable,
  ScheduledJob,
  AutomationTemplate,
  Json,
} from "@/types/generated/database";

export type {
  Json,
  WorkflowStatus,
  WorkflowRunStatus,
  TriggerType,
  ActionType,
  ExecutionMode,
  ScheduleType,
  ScheduledJobStatus,
  LogLevel,
  VariableScope,
  ConditionOperator,
  TemplateCategory,
  Workflow,
  WorkflowVersion,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowRun,
  WorkflowLog,
  WorkflowVariable,
  ScheduledJob,
  AutomationTemplate,
};

// ─── Action Response ───────────────────────────────────────

export interface AutomationActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

// ─── Paginated Response ────────────────────────────────────

export interface PaginatedAutomationResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── List Options ──────────────────────────────────────────

export interface WorkflowListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: WorkflowStatus;
}

export interface WorkflowRunListOptions {
  workspaceId: string;
  workflowId?: string;
  page?: number;
  pageSize?: number;
  status?: WorkflowRunStatus;
}

export interface WorkflowLogListOptions {
  workspaceId: string;
  runId?: string;
  workflowId?: string;
  page?: number;
  pageSize?: number;
  level?: LogLevel;
}

export interface ScheduledJobListOptions {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  status?: ScheduledJobStatus;
}

export interface TemplateListOptions {
  page?: number;
  pageSize?: number;
  category?: TemplateCategory;
  search?: string;
}

// ─── Enriched Models ───────────────────────────────────────

export interface WorkflowWithRelations extends Workflow {
  triggerCount?: number;
  actionCount?: number;
  runCount?: number;
  lastRunAt?: string | null;
  lastRunStatus?: WorkflowRunStatus | null;
}

export interface WorkflowRunWithRelations extends WorkflowRun {
  workflow?: { id: string; name: string };
  trigger?: { id: string; name: string; trigger_type: TriggerType };
}

export interface WorkflowDetail extends Workflow {
  triggers?: WorkflowTrigger[];
  actions?: WorkflowAction[];
  variables?: WorkflowVariable[];
  versions?: WorkflowVersion[];
}

// ─── Trigger System Types ──────────────────────────────────

export interface TriggerEvent {
  eventName: string;
  workspaceId: string;
  userId?: string;
  payload: Json;
  timestamp: string;
}

export interface TriggerHandler {
  canHandle(eventName: string): boolean;
  handle(event: TriggerEvent): Promise<TriggerEvent[]>;
}

export interface TriggerRegistration {
  eventName: string;
  handler: TriggerHandler;
}

// ─── Action System Types ───────────────────────────────────

export interface ActionContext {
  runId: string;
  workflowId: string;
  workspaceId: string;
  userId?: string;
  variables: Record<string, unknown>;
  stepOutputs: Map<string, unknown>;
}

export interface ActionHandler {
  type: ActionType;
  execute(config: Json, context: ActionContext): Promise<ActionHandlerResult>;
  validate?(config: Json): string | null;
}

export interface ActionHandlerResult {
  success: boolean;
  output?: unknown;
  error?: string;
  shouldRetry?: boolean;
}

export interface ActionRegistration {
  type: ActionType;
  handler: ActionHandler;
}

// ─── Workflow Execution Types ──────────────────────────────

export interface WorkflowExecutionContext {
  runId: string;
  workflowId: string;
  workspaceId: string;
  userId?: string;
  triggerType: TriggerType;
  inputData: Json;
  variables: Map<string, unknown>;
  stepOutputs: Map<string, unknown>;
  startedAt: number;
}

export interface StepResult {
  actionId: string;
  actionName: string;
  actionType: ActionType;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  stepPosition: number;
}

// ─── Condition System Types ────────────────────────────────

export interface Condition {
  operator: ConditionOperator;
  left: string;
  right?: string;
  conditions?: ConditionGroup;
  logic?: "and" | "or";
}

export interface ConditionGroup {
  logic: "and" | "or";
  conditions: Condition[];
}

// ─── Variable System Types ─────────────────────────────────

export interface VariableDefinition {
  name: string;
  defaultValue?: unknown;
  scope: VariableScope;
  description?: string;
  isRequired?: boolean;
}

export interface ResolvedVariables {
  global: Record<string, unknown>;
  local: Record<string, unknown>;
  stepOutputs: Record<string, unknown>;
  environment: Record<string, unknown>;
}

// ─── Scheduling Types ──────────────────────────────────────

export interface ScheduleConfig {
  type: ScheduleType;
  cronExpression?: string;
  timezone?: string;
  maxRuns?: number;
  startDate?: string;
  endDate?: string;
}

// ─── Template Types ────────────────────────────────────────

export interface TemplateDefinition {
  name: string;
  description: string;
  category: TemplateCategory;
  triggers: Json[];
  actions: Json[];
  variables: VariableDefinition[];
}

// ─── Monitoring Types ──────────────────────────────────────

export interface AutomationMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  totalRuns: number;
  runningRuns: number;
  failedRuns: number;
  avgExecutionMs: number;
  retryCount: number;
  scheduledJobs: number;
  activeScheduledJobs: number;
}

export interface WorkflowRunMetrics {
  workflowId: string;
  workflowName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDurationMs: number;
  lastRunAt: string | null;
}
