/**
 * Internal Module Bridge
 *
 * Connects all Supa AI modules to the Integration Hub event bus.
 * Each module publishes domain events that other modules can subscribe to.
 * This is the central nervous system for cross-module communication.
 */

import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";

/**
 * Event types emitted by each module.
 * These are the canonical event names used across the platform.
 */
export const ModuleEvents = {
  // AI Chat
  CHAT_MESSAGE_CREATED: "chat.message.created",
  CHAT_MESSAGE_STREAMING: "chat.message.streaming",
  CHAT_CONversation_CREATED: "chat.conversation.created",

  // AI Employees
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_MESSAGE_RECEIVED: "employee.message.received",
  EMPLOYEE_TASK_COMPLETED: "employee.task.completed",

  // Automation Engine
  AUTOMATION_WORKFLOW_TRIGGERED: "automation.workflow.triggered",
  AUTOMATION_WORKFLOW_COMPLETED: "automation.workflow.completed",
  AUTOMATION_WORKFLOW_FAILED: "automation.workflow.failed",
  AUTOMATION_SCHEDULE_FIRED: "automation.schedule.fired",

  // Workflow Builder
  WORKFLOW_NODE_EXECUTED: "workflow.node.executed",
  WORKFLOW_EXECUTION_COMPLETED: "workflow.execution.completed",
  WORKFLOW_EXECUTION_FAILED: "workflow.execution.failed",
  WORKFLOW_VERSION_PUBLISHED: "workflow.version.published",

  // CRM
  CRM_LEAD_CREATED: "crm.lead.created",
  CRM_LEAD_CONVERTED: "crm.lead.converted",
  CRM_CONTACT_UPDATED: "crm.contact.updated",
  CRM_DEAL_STAGE_CHANGED: "crm.deal.stage_changed",

  // ERP / Business
  INVOICE_CREATED: "invoice.created",
  INVOICE_PAID: "invoice.paid",
  EXPENSE_CREATED: "expense.created",
  PROPOSAL_SENT: "proposal.sent",
  CONTRACT_SIGNED: "contract.signed",
  PROJECT_CREATED: "project.created",

  // Workspace
  WORKSPACE_MEMBER_ADDED: "workspace.member.added",
  WORKSPACE_MEMBER_REMOVED: "workspace.member.removed",
  WORKSPACE_SETTINGS_CHANGED: "workspace.settings.changed",

  // Billing
  BILLING_SUBSCRIPTION_CREATED: "billing.subscription.created",
  BILLING_PAYMENT_SUCCEEDED: "billing.payment.succeeded",
  BILLING_PAYMENT_FAILED: "billing.payment.failed",

  // Notifications
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_READ: "notification.read",

  // Knowledge Base
  KNOWLEDGE_ARTICLE_CREATED: "knowledge.article.created",
  KNOWLEDGE_ARTICLE_UPDATED: "knowledge.article.updated",

  // Search
  SEARCH_INDEX_UPDATED: "search.index.updated",

  // Reports
  REPORT_GENERATED: "report.generated",
} as const;

export type ModuleEventType = (typeof ModuleEvents)[keyof typeof ModuleEvents];

/**
 * Module subscription configuration.
 * Defines which events a module wants to listen to.
 */
export interface ModuleSubscription {
  moduleId: string;
  moduleName: string;
  events: ModuleEventType[];
  handler: string; // Reference to the handler function path
}

/**
 * Built-in module subscriptions.
 * These are registered when the application starts.
 */
export const builtinSubscriptions: ModuleSubscription[] = [
  // AI Chat subscribes to AI Employee events
  {
    moduleId: "ai-chat",
    moduleName: "AI Chat",
    events: [ModuleEvents.EMPLOYEE_MESSAGE_RECEIVED, ModuleEvents.EMPLOYEE_TASK_COMPLETED],
    handler: "@/services/chat/conversation-service#handleEmployeeEvent",
  },
  // AI Employees subscribe to CRM events
  {
    moduleId: "ai-employees",
    moduleName: "AI Employees",
    events: [ModuleEvents.CRM_LEAD_CREATED, ModuleEvents.CRM_DEAL_STAGE_CHANGED, ModuleEvents.INVOICE_CREATED],
    handler: "@/services/employee/actions#handleCrmEvent",
  },
  // Automation Engine subscribes to CRM + ERP events
  {
    moduleId: "automation",
    moduleName: "Automation Engine",
    events: [
      ModuleEvents.CRM_LEAD_CREATED, ModuleEvents.CRM_LEAD_CONVERTED,
      ModuleEvents.INVOICE_CREATED, ModuleEvents.INVOICE_PAID,
      ModuleEvents.EXPENSE_CREATED, ModuleEvents.PROJECT_CREATED,
    ],
    handler: "@/services/automation/triggers#dispatchEvent",
  },
  // Workflow Builder subscribes to Automation events
  {
    moduleId: "workflow-builder",
    moduleName: "Workflow Builder",
    events: [ModuleEvents.AUTOMATION_WORKFLOW_COMPLETED, ModuleEvents.AUTOMATION_WORKFLOW_FAILED],
    handler: "@/services/workflow-builder/actions#handleAutomationEvent",
  },
  // CRM subscribes to AI Employee events (auto-log interactions)
  {
    moduleId: "crm",
    moduleName: "CRM",
    events: [ModuleEvents.EMPLOYEE_TASK_COMPLETED],
    handler: "@/services/crm/actions#handleEmployeeEvent",
  },
  // Notifications subscribes to everything important
  {
    moduleId: "notifications",
    moduleName: "Notifications",
    events: [
      ModuleEvents.CRM_LEAD_CREATED, ModuleEvents.CRM_DEAL_STAGE_CHANGED,
      ModuleEvents.INVOICE_PAID, ModuleEvents.AUTOMATION_WORKFLOW_FAILED,
      ModuleEvents.CONTRACT_SIGNED, ModuleEvents.PROJECT_CREATED,
      ModuleEvents.BILLING_PAYMENT_FAILED,
    ],
    handler: "@/services/notification/actions#handleModuleEvent",
  },
  // Knowledge Base subscribes to document events
  {
    moduleId: "knowledge-base",
    moduleName: "Knowledge Base",
    events: [ModuleEvents.KNOWLEDGE_ARTICLE_CREATED, ModuleEvents.KNOWLEDGE_ARTICLE_UPDATED],
    handler: "@/services/knowledge-base/actions#handleKnowledgeEvent",
  },
  // Search subscribes to content changes
  {
    moduleId: "search",
    moduleName: "Search",
    events: [
      ModuleEvents.KNOWLEDGE_ARTICLE_CREATED, ModuleEvents.KNOWLEDGE_ARTICLE_UPDATED,
      ModuleEvents.CRM_CONTACT_UPDATED, ModuleEvents.INVOICE_CREATED,
    ],
    handler: "@/services/search/actions#handleIndexEvent",
  },
];

/**
 * Convenience function to publish a module event.
 * Delegates to the event bus publishEvent.
 */
export async function emitModuleEvent(params: {
  eventType: ModuleEventType;
  workspaceId: string;
  userId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { eventType, workspaceId, userId, payload } = params;
  logger.info("Module event emitted", { eventType, workspaceId, userId });

  // Dynamic import to avoid circular dependency
  const { publishEvent } = await import("@/services/integration-hub/event-bus");
  await publishEvent({
    eventType,
    workspaceId,
    payload: payload as unknown as Json,
    source: "module_bridge",
  });
}

/**
 * Register all built-in module subscriptions with the event bus.
 * Call this during application initialization.
 */
export async function registerModuleSubscriptions(workspaceId: string): Promise<void> {
  const { subscribeToEvent } = await import("@/services/integration-hub/event-bus");

  for (const sub of builtinSubscriptions) {
    for (const eventType of sub.events) {
      await subscribeToEvent({
        workspaceId,
        eventType,
        handlerType: "internal",
        handlerConfig: {
          moduleId: sub.moduleId,
          handler: sub.handler,
        },
      });
    }
  }

  logger.info("Module subscriptions registered", {
    workspaceId,
    moduleCount: builtinSubscriptions.length,
    eventCount: builtinSubscriptions.reduce((sum, s) => sum + s.events.length, 0),
  });
}