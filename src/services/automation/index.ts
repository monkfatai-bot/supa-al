// ── Actions ──────────────────────────────────────────────────────────────────

export {
  // Workflows
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  getWorkflows,
  getWorkflow,
  // Triggers
  createTrigger,
  updateTrigger,
  deleteTrigger,
  // Actions
  createAction,
  updateAction,
  deleteAction,
  // Variables
  upsertVariable,
  deleteVariable,
  // Execution
  runWorkflow,
  stopRun,
  retryRun,
  // History & Logs
  getWorkflowRuns,
  getWorkflowLogs,
  // Scheduled Jobs
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  getScheduledJobs,
  // Templates
  getTemplates,
  createWorkflowFromTemplate,
  // Metrics
  getAutomationMetrics,
} from "./actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type {
  AutomationActionResponse,
  PaginatedAutomationResponse,
  WorkflowListOptions,
  WorkflowRunListOptions,
  WorkflowLogListOptions,
  ScheduledJobListOptions,
  TemplateListOptions,
  WorkflowWithRelations,
  WorkflowRunWithRelations,
  WorkflowDetail,
  AutomationMetrics,
  WorkflowRunMetrics,
  TriggerEvent,
  TriggerHandler,
  TriggerRegistration,
  ActionContext,
  ActionHandler,
  ActionHandlerResult,
  ActionRegistration,
  WorkflowExecutionContext,
  StepResult,
  Condition,
  ConditionGroup,
  VariableDefinition,
  ResolvedVariables,
  ScheduleConfig,
  TemplateDefinition,
} from "./types";

export type {
  Workflow,
  WorkflowVersion,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowRun,
  WorkflowLog,
  WorkflowVariable,
  ScheduledJob,
  AutomationTemplate,
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
} from "./types";

// ── Engine ───────────────────────────────────────────────────────────────────

export { executeWorkflowByTrigger, executeWorkflowManually, stopWorkflowRun, retryWorkflowRun } from "./engine";

// ── Triggers ─────────────────────────────────────────────────────────────────

export { triggerRegistry, registerBuiltinTriggers, dispatchEvent } from "./triggers";

// ── Actions Registry ─────────────────────────────────────────────────────────

export { actionRegistry } from "./actions/registry";
export { registerBuiltinActions, builtinActionHandlers } from "./actions/handlers";

// ── Scheduler ────────────────────────────────────────────────────────────────

export { processScheduledJobs, calculateNextRunTime } from "./scheduler";

// ── Templates ────────────────────────────────────────────────────────────────

export { getBuiltinTemplates, getTemplatesByCategory } from "./templates";
