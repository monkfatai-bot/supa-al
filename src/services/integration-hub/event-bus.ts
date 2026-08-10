"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";
import type { IntegrationLog } from "@/types/generated/database";
import type {
  EventBusSubscription,
  PublishEventParams,
  SubscribeToEventParams,
  ServiceResult,
} from "./types";
import { deliverWebhook } from "./webhook-engine";

// ─── publishEvent ──────────────────────────────────────────────

export async function publishEvent(
  params: PublishEventParams
): Promise<ServiceResult<{ logId: string; dispatched: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(params.workspaceId, profile.id);

    // 1. Record the event in integration_logs (direction = outbound)
    const { data: logEntry, error: logError } = await supabase
      .from("integration_logs")
      .insert({
        workspace_id: params.workspaceId,
        action: `event:${params.eventType}`,
        direction: "outbound" as const,
        request: { payload: params.payload, source: params.source } as Json,
        status: "success" as const,
      })
      .select("id")
      .single();

    if (logError) {
      logger.error("Failed to record published event", {
        reason: logError.message,
      });
      return {
        success: false,
        message: "Failed to record event.",
        error: logError.message,
      };
    }

    // 2. Find matching event_subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("event_subscriptions")
      .select("*")
      .eq("workspace_id", params.workspaceId)
      .eq("event_type", params.eventType)
      .eq("status", "active" as const);

    if (subError) {
      logger.error("Failed to fetch event subscriptions", {
        reason: subError.message,
      });
    }

    const subs = subscriptions ?? [];
    let dispatched = 0;

    // 3. Dispatch to each matching subscription
    for (const sub of subs) {
      try {
        await dispatchHandler({
          subscription: sub as EventBusSubscription,
          eventType: params.eventType,
          payload: params.payload,
          workspaceId: params.workspaceId,
        });
        dispatched++;
      } catch (err) {
        logger.error("Event handler dispatch failed", {
          subscriptionId: sub.id,
          handlerType: sub.handler_type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      success: true,
      message: `Event published and dispatched to ${dispatched} handler(s).`,
      data: { logId: logEntry.id, dispatched },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to publish event.";
    return { success: false, message, error: message };
  }
}

// ─── Handler dispatch (internal) ──────────────────────────────

async function dispatchHandler({
  subscription,
  eventType,
  payload,
  workspaceId,
}: {
  subscription: EventBusSubscription;
  eventType: string;
  payload: Json;
  workspaceId: string;
}): Promise<void> {
  const config = subscription.handlerConfig as Record<string, unknown>;

  switch (subscription.handlerType) {
    case "webhook": {
      const webhookId = config.webhookId as string;
      if (!webhookId) {
        logger.warn("Webhook handler missing webhookId", {
          subscriptionId: subscription.id,
        });
        return;
      }
      const result = await deliverWebhook({
        webhookId,
        eventType,
        payload,
      });
      if (!result.success) {
        logger.warn("Webhook delivery failed from event bus", {
          webhookId,
          eventType,
        });
      }
      break;
    }

    case "automation": {
      // Dispatch to automation engine
      try {
        const { dispatchEvent } = await import(
          "@/services/automation/triggers"
        );
        await dispatchEvent({
          eventName: eventType,
          workspaceId,
          userId: "", // Event bus fires are system-level
          payload,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.error("Automation dispatch failed from event bus", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "employee": {
      // Dispatch to AI employee via the employee service's messaging function
      try {
        const employeeId = config.employeeId as string;
        if (!employeeId) {
          logger.warn("Employee handler missing employeeId", {
            subscriptionId: subscription.id,
          });
          return;
        }
        const { sendEmployeeMessage } = await import(
          "@/services/employee/actions"
        );
        const prompt = config.prompt as string | undefined;
        const message = typeof payload === "object"
          ? JSON.stringify(payload, null, 2)
          : String(payload);
        await sendEmployeeMessage(employeeId, workspaceId, prompt
          ? `${prompt}\n\n${message}`
          : `Event received: ${eventType}\n\n${message}`, workspaceId);
      } catch (err) {
        logger.error("Employee dispatch failed from event bus", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case "internal": {
      // Internal handlers — log and process
      logger.info("Internal event handler triggered", {
        eventType,
        subscriptionId: subscription.id,
      });
      // Future: route to specific internal handlers based on config
      break;
    }

    default:
      logger.warn("Unknown handler type in event bus", {
        handlerType: subscription.handlerType,
        subscriptionId: subscription.id,
      });
  }
}

// ─── subscribeToEvent ─────────────────────────────────────────

export async function subscribeToEvent(
  params: SubscribeToEventParams
): Promise<ServiceResult<EventBusSubscription>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    if (!params.eventType.trim()) {
      return { success: false, message: "Event type is required." };
    }

    const validHandlers = ["webhook", "automation", "employee", "internal"];
    if (!validHandlers.includes(params.handlerType)) {
      return {
        success: false,
        message: `Invalid handler type. Must be one of: ${validHandlers.join(", ")}`,
      };
    }

    const { data, error } = await supabase
      .from("event_subscriptions")
      .insert({
        workspace_id: params.workspaceId,
        event_type: params.eventType.trim(),
        handler_type: params.handlerType,
        handler_config: params.handlerConfig,
        status: "active" as const,
        retry_count: 3,
        filters: params.filters ?? {},
      })
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to create event subscription", {
        reason: error?.message,
      });
      return {
        success: false,
        message: "Failed to create event subscription.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "Event subscription created.",
      data: {
        id: data.id,
        eventType: data.event_type,
        handlerType: data.handler_type as EventBusSubscription["handlerType"],
        handlerConfig: data.handler_config as Json,
        status: data.status,
        retryCount: data.retry_count,
        filters: data.filters as Json,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to subscribe to event.";
    return { success: false, message, error: message };
  }
}

// ─── unsubscribeFromEvent ─────────────────────────────────────

export async function unsubscribeFromEvent(
  workspaceId: string,
  subscriptionId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { error } = await supabase
      .from("event_subscriptions")
      .delete()
      .eq("id", subscriptionId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to unsubscribe from event", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to unsubscribe.",
        error: error.message,
      };
    }

    return { success: true, message: "Unsubscribed from event." };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to unsubscribe.";
    return { success: false, message, error: message };
  }
}

// ─── listSubscriptions ────────────────────────────────────────

export async function listSubscriptions(
  workspaceId: string,
  eventType?: string
): Promise<ServiceResult<EventBusSubscription[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    let query = supabase
      .from("event_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to list event subscriptions", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to list event subscriptions.",
        error: error.message,
      };
    }

    const subs: EventBusSubscription[] = (data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      handlerType: row.handler_type as EventBusSubscription["handlerType"],
      handlerConfig: row.handler_config as Json,
      status: row.status,
      retryCount: row.retry_count,
      filters: row.filters as Json,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      message: `Found ${subs.length} subscriptions.`,
      data: subs,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list subscriptions.";
    return { success: false, message, error: message };
  }
}

// ─── getEventLog ───────────────────────────────────────────────

export async function getEventLog({
  workspaceId,
  eventType,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
}: {
  workspaceId: string;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<ServiceResult<IntegrationLog[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    let query = supabase
      .from("integration_logs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("direction", "outbound")
      .like("action", "event:%")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (eventType) {
      query = query.like("action", `event:${eventType}`);
    }
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch event log", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch event log.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Retrieved ${(data ?? []).length} event log entries.`,
      data: (data ?? []) as IntegrationLog[],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get event log.";
    return { success: false, message, error: message };
  }
}

// ─── replayEvent ───────────────────────────────────────────────

export async function replayEvent(
  workspaceId: string,
  logId: string
): Promise<ServiceResult<{ dispatched: number }>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    // Fetch the original event log
    const { data: logEntry, error: fetchError } = await supabase
      .from("integration_logs")
      .select("*")
      .eq("id", logId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !logEntry) {
      return {
        success: false,
        message: "Event log entry not found.",
        error: fetchError?.message,
      };
    }

    // Extract event type and payload from the action and request
    const action = logEntry.action; // e.g., "event:invoice.created"
    const eventType = action.startsWith("event:")
      ? action.substring(6)
      : action;
    const request = (logEntry.request as Record<string, unknown>) ?? {};
    const payload = (request.payload as Json) ?? {};

    // Find current matching subscriptions
    const { data: subscriptions } = await supabase
      .from("event_subscriptions")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("event_type", eventType)
      .eq("status", "active" as const);

    const subs = subscriptions ?? [];
    let dispatched = 0;

    for (const sub of subs) {
      try {
        await dispatchHandler({
          subscription: sub as EventBusSubscription,
          eventType,
          payload,
          workspaceId,
        });
        dispatched++;
      } catch (err) {
        logger.error("Replay dispatch failed", {
          subscriptionId: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Log the replay
    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      action: `replay:${eventType}`,
      direction: "outbound" as const,
      request: { originalLogId: logId, payload } as Json,
      status: "success" as const,
    });

    return {
      success: true,
      message: `Event replayed to ${dispatched} handler(s).`,
      data: { dispatched },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to replay event.";
    return { success: false, message, error: message };
  }
}
