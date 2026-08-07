/**
 * Supa AI — Phase 9A Automation — full barrel (server-only).
 *
 * Re-exports the client-safe types *plus* the server-only
 * {@link AutomationService}, {@link WorkflowExecutor},
 * {@link TriggerDispatcher}, {@link WebhookDispatcher},
 * {@link Scheduler}, {@link RunQueue}, {@link ActionRegistry},
 * {@link ConditionEvaluator}, and {@link VariableResolver}.
 *
 * Importing this barrel from a Client Component will throw at build
 * time — client code MUST import from `@/lib/automation/client` instead.
 *
 * @module @/lib/automation
 */
import "server-only";

export * from "./client";
export {
  ActionRegistry,
  BUILTIN_HANDLERS,
  actionRegistry,
} from "./registry";
export {
  ConditionEvaluator,
  conditionEvaluator,
} from "./evaluator";
export {
  VariableResolver,
  variableResolver,
} from "./resolver";
export {
  AutomationService,
  createAutomationService,
} from "./service";
export {
  WorkflowExecutor,
} from "./executor";
export {
  TriggerDispatcher,
} from "./dispatcher";
export {
  WebhookDispatcher,
} from "./trigger-dispatcher";
export {
  Scheduler,
} from "./scheduler";
export {
  RunQueue,
  runQueue,
} from "./queue";
