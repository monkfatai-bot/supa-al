/**
 * Built-in event trigger handlers.
 * Registers handlers for all standard platform events.
 */

import { triggerRegistry } from "./registry";
import type { TriggerEvent, TriggerHandler, Json } from "../types";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { logger } from "@/services/logger";

/**
 * Find active workflows that listen for a specific event.
 */
async function findMatchingWorkflows(
  eventName: string,
  workspaceId: string,
): Promise<Array<{ workflowId: string; triggerId: string; config: Record<string, unknown> }>> {
  const supabase = await createServerSupabaseClient();
  // Use flat join to avoid nested array typing issues
  const { data: triggers } = await supabase
    .from("workflow_triggers")
    .select(`
      id,
      workflow_id,
      config,
      workflows!inner(id, status, workspace_id)
    `)
    .eq("trigger_type", "event" as const)
    .eq("event_name", eventName)
    .eq("workflows.status", "active" as const)
    .eq("workflows.workspace_id", workspaceId)
    .eq("is_enabled", true);

  if (!triggers || triggers.length === 0) return [];

  return triggers.map((t) => {
    // Supabase join returns nested object
    const wf = (t as Record<string, unknown>).workflows as { id: string; status: string } | undefined;
    return {
      workflowId: wf?.id ?? (t as Record<string, unknown>).workflow_id as string,
      triggerId: t.id,
      config: (t.config as Record<string, unknown>) ?? {},
    };
  });
}

/**
 * Generic event handler that matches events to workflows and returns
 * trigger events for each matched workflow.
 */
class EventHandler implements TriggerHandler {
  constructor(private eventName: string) {}

  canHandle(name: string): boolean {
    return name === this.eventName;
  }

  async handle(event: TriggerEvent): Promise<TriggerEvent[]> {
    const matches = await findMatchingWorkflows(event.eventName, event.workspaceId);
    if (matches.length === 0) return [];

    return matches.map((match) => {
      const basePayload = typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {};
      return {
        eventName: event.eventName,
        workspaceId: event.workspaceId,
        userId: event.userId,
        payload: { ...basePayload, _triggerId: match.triggerId, _workflowId: match.workflowId, _triggerConfig: match.config } as unknown as Json,
        timestamp: event.timestamp,
      };
    });
  }
}

/**
 * Register all built-in event triggers.
 * Call this once during application initialization.
 */
export function registerBuiltinTriggers(): void {
  const events = [
    // User events
    "user.created",
    "user.updated",
    // Workspace events
    "workspace.created",
    "workspace.member_added",
    "workspace.member_removed",
    // Conversation events
    "conversation.created",
    "conversation.updated",
    // AI events
    "ai.chat_completed",
    "ai.image_generated",
    "ai.video_generated",
    "ai.voice_generated",
    // Business events
    "invoice.created",
    "invoice.paid",
    "contract.signed",
    "customer.created",
    "lead.created",
    "project.created",
    "task.completed",
    // File events
    "file.uploaded",
    // Webhook events
    "webhook.received",
    // Scheduled events
    "schedule.trigger",
    // Manual events
    "manual.trigger",
    // API events
    "api.trigger",
  ];

  for (const eventName of events) {
    triggerRegistry.register({
      eventName,
      handler: new EventHandler(eventName),
    });
  }

  logger.info("Built-in triggers registered", { count: events.length });
}

/**
 * Dispatch an event to the trigger system.
 * This is the main entry point for triggering workflows from anywhere in the app.
 */
export async function dispatchEvent(event: TriggerEvent): Promise<void> {
  const results = await triggerRegistry.dispatch(event);
  if (results.length > 0) {
    // Import dynamically to avoid circular dependencies
    const { executeWorkflowByTrigger } = await import("../engine");
    for (const result of results) {
      const triggerId = (result.payload as Record<string, unknown>)._triggerId as string | undefined;
      void executeWorkflowByTrigger({
        triggerId,
        workflowId: (result.payload as Record<string, unknown>)._workflowId as string | undefined,
        workspaceId: result.workspaceId,
        userId: result.userId,
        triggerType: "event" as const,
        inputData: result.payload,
      });
    }
  }
}
