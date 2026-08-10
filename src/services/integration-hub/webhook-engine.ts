
import nodeCrypto from "node:crypto";
const crypto = nodeCrypto;

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import {
  verifyWorkspaceMembership,
  requireMinimumRole,
} from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";
import type { WebhookEvent as WebhookEventRow } from "@/types/generated/database";
import type {
  WebhookInfo,
  WebhookDeliveryResult,
  WebhookStats,
  CreateWebhookParams,
  ServiceResult,
} from "./types";

// ─── Signing helpers ───────────────────────────────────────────

/** Sign a payload with HMAC-SHA256 using the webhook secret. */
function signPayload(payload: unknown, secret: string): string {
  const payloadStr = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
}

/** Verify an incoming webhook signature. */
export function verifyWebhookSignature({
  payload,
  signature,
  secret,
}: {
  payload: unknown;
  signature: string;
  secret: string;
}): boolean {
  const expected = signPayload(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

/** Generate a random webhook secret. */
function generateSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ─── Internal: deliverWebhook ───────────────────────────────────

/**
 * Core webhook delivery function.
 * Signs the payload, sends POST to the webhook URL,
 * records result in webhook_events, handles retries with exponential backoff.
 * NOT exported as a server action.
 */
export async function deliverWebhook({
  webhookId,
  eventType,
  payload,
}: {
  webhookId: string;
  eventType: string;
  payload: Json;
}): Promise<WebhookDeliveryResult> {
  const supabase = await createServerSupabaseClient();

  // Fetch the webhook
  const { data: webhook, error: fetchError } = await supabase
    .from("webhooks")
    .select("*")
    .eq("id", webhookId)
    .eq("status", "active" as const)
    .single();

  if (fetchError || !webhook) {
    logger.error("Webhook not found or inactive", { webhookId });
    return {
      success: false,
      responseStatus: 0,
      errorMessage: "Webhook not found or inactive.",
      durationMs: 0,
    };
  }

  const start = Date.now();
  const signature = signPayload(payload, webhook.secret);
  const eventId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), webhook.timeout_ms);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Id": eventId,
      "X-Webhook-Event": eventType,
      "User-Agent": "SupaAI-Webhooks/1.0",
    };

    // Merge custom headers
    const customHeaders = (webhook.headers as Record<string, string>) ?? {};
    for (const [k, v] of Object.entries(customHeaders)) {
      headers[k] = v;
    }

    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - start;
    const responseBody = await response.text().catch(() => "");

    const isSuccess = response.status >= 200 && response.status < 300;

    // Record the event
    await supabase.from("webhook_events").insert({
      webhook_id: webhookId,
      workspace_id: webhook.workspace_id,
      event_type: eventType,
      payload,
      response_status: response.status,
      response_body: responseBody.substring(0, 10_000), // Truncate large responses
      error_message: isSuccess ? null : `HTTP ${response.status}`,
      attempt_count: 1,
      status: isSuccess ? ("success" as const) : ("failed" as const),
    });

    // Update webhook counters
    const updateField = isSuccess
      ? { success_count: webhook.success_count + 1 }
      : { failure_count: webhook.failure_count + 1 };

    await supabase
      .from("webhooks")
      .update({
        ...updateField,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", webhookId);

    return {
      success: isSuccess,
      responseStatus: response.status,
      responseBody,
      errorMessage: isSuccess ? undefined : `HTTP ${response.status}`,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMessage =
      err instanceof Error ? err.message : "Webhook delivery failed.";

    // Record failure
    await supabase.from("webhook_events").insert({
      webhook_id: webhookId,
      workspace_id: webhook.workspace_id,
      event_type: eventType,
      payload,
      response_status: 0,
      response_body: null,
      error_message: errorMessage,
      attempt_count: 1,
      status: "failed" as const,
    });

    await supabase
      .from("webhooks")
      .update({
        failure_count: webhook.failure_count + 1,
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", webhookId);

    return {
      success: false,
      responseStatus: 0,
      errorMessage,
      durationMs,
    };
  }
}

// ─── createWebhook ─────────────────────────────────────────────

export async function createWebhook(
  params: CreateWebhookParams
): Promise<ServiceResult<WebhookInfo>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    if (!params.name.trim()) {
      return { success: false, message: "Webhook name is required." };
    }

    if (!params.events || params.events.length === 0) {
      return { success: false, message: "At least one event type is required." };
    }

    try {
      new URL(params.url);
    } catch {
      return { success: false, message: "Invalid webhook URL." };
    }

    const secret = params.secret ?? generateSecret();

    const { data, error } = await supabase
      .from("webhooks")
      .insert({
        workspace_id: params.workspaceId,
        name: params.name.trim(),
        url: params.url,
        secret,
        events: params.events,
        status: "active" as const,
        retry_count: params.retryCount ?? 3,
        timeout_ms: params.timeoutMs ?? 30000,
        headers: params.headers ?? {},
        metadata: {},
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to create webhook", { reason: error?.message });
      return {
        success: false,
        message: "Failed to create webhook.",
        error: error?.message,
      };
    }

    const info: WebhookInfo = {
      id: data.id,
      name: data.name,
      url: data.url,
      events: data.events,
      status: data.status,
      retryCount: data.retry_count,
      timeoutMs: data.timeout_ms,
      headers: (data.headers as Json) ?? {},
      lastTriggeredAt: data.last_triggered_at,
      successCount: data.success_count,
      failureCount: data.failure_count,
      createdBy: data.created_by,
      createdAt: data.created_at,
    };

    return {
      success: true,
      message: "Webhook created.",
      data: info,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create webhook.";
    return { success: false, message, error: message };
  }
}

// ─── listWebhooks ──────────────────────────────────────────────

export async function listWebhooks(
  workspaceId: string,
  status?: string
): Promise<ServiceResult<WebhookInfo[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    let query = supabase
      .from("webhooks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to list webhooks", { reason: error.message });
      return {
        success: false,
        message: "Failed to list webhooks.",
        error: error.message,
      };
    }

    const webhooks: WebhookInfo[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      events: row.events,
      status: row.status,
      retryCount: row.retry_count,
      timeoutMs: row.timeout_ms,
      headers: (row.headers as Json) ?? {},
      lastTriggeredAt: row.last_triggered_at,
      successCount: row.success_count,
      failureCount: row.failure_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      message: `Found ${webhooks.length} webhooks.`,
      data: webhooks,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list webhooks.";
    return { success: false, message, error: message };
  }
}

// ─── getWebhook ────────────────────────────────────────────────

export async function getWebhook(
  workspaceId: string,
  webhookId: string
): Promise<ServiceResult<WebhookInfo>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data, error } = await supabase
      .from("webhooks")
      .select("*")
      .eq("id", webhookId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !data) {
      return {
        success: false,
        message: "Webhook not found.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "Webhook retrieved.",
      data: {
        id: data.id,
        name: data.name,
        url: data.url,
        events: data.events,
        status: data.status,
        retryCount: data.retry_count,
        timeoutMs: data.timeout_ms,
        headers: (data.headers as Json) ?? {},
        lastTriggeredAt: data.last_triggered_at,
        successCount: data.success_count,
        failureCount: data.failure_count,
        createdBy: data.created_by,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get webhook.";
    return { success: false, message, error: message };
  }
}

// ─── updateWebhook ─────────────────────────────────────────────

export async function updateWebhook(
  workspaceId: string,
  webhookId: string,
  updates: {
    name?: string;
    url?: string;
    events?: string[];
    status?: string;
    retryCount?: number;
    timeoutMs?: number;
    headers?: Json;
  }
): Promise<ServiceResult<WebhookInfo>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const updateRow: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updateRow.name = updates.name.trim();
    if (updates.url !== undefined) updateRow.url = updates.url;
    if (updates.events !== undefined) updateRow.events = updates.events;
    if (updates.status !== undefined) updateRow.status = updates.status;
    if (updates.retryCount !== undefined) updateRow.retry_count = updates.retryCount;
    if (updates.timeoutMs !== undefined) updateRow.timeout_ms = updates.timeoutMs;
    if (updates.headers !== undefined) updateRow.headers = updates.headers;

    const { data, error } = await supabase
      .from("webhooks")
      .update(updateRow)
      .eq("id", webhookId)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error || !data) {
      logger.error("Failed to update webhook", { reason: error?.message });
      return {
        success: false,
        message: "Failed to update webhook.",
        error: error?.message,
      };
    }

    return {
      success: true,
      message: "Webhook updated.",
      data: {
        id: data.id,
        name: data.name,
        url: data.url,
        events: data.events,
        status: data.status,
        retryCount: data.retry_count,
        timeoutMs: data.timeout_ms,
        headers: (data.headers as Json) ?? {},
        lastTriggeredAt: data.last_triggered_at,
        successCount: data.success_count,
        failureCount: data.failure_count,
        createdBy: data.created_by,
        createdAt: data.created_at,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update webhook.";
    return { success: false, message, error: message };
  }
}

// ─── deleteWebhook ─────────────────────────────────────────────

export async function deleteWebhook(
  workspaceId: string,
  webhookId: string
): Promise<ServiceResult<null>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { error } = await supabase
      .from("webhooks")
      .delete()
      .eq("id", webhookId)
      .eq("workspace_id", workspaceId);

    if (error) {
      logger.error("Failed to delete webhook", { reason: error.message });
      return {
        success: false,
        message: "Failed to delete webhook.",
        error: error.message,
      };
    }

    return { success: true, message: "Webhook deleted." };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete webhook.";
    return { success: false, message, error: message };
  }
}

// ─── testWebhook ───────────────────────────────────────────────

export async function testWebhook(
  workspaceId: string,
  webhookId: string
): Promise<ServiceResult<WebhookDeliveryResult>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    const { data: webhook, error } = await supabase
      .from("webhooks")
      .select("id, url, secret, timeout_ms, headers")
      .eq("id", webhookId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !webhook) {
      return {
        success: false,
        message: "Webhook not found.",
        error: error?.message,
      };
    }

    // Send a test ping
    const testPayload: Json = {
      type: "ping",
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
      message: "Webhook test from SupaAI",
    };

    const result = await deliverWebhook({
      webhookId,
      eventType: "ping",
      payload: testPayload,
    });

    if (result.success) {
      return {
        success: true,
        message: `Test webhook delivered successfully (${result.responseStatus}) in ${result.durationMs}ms.`,
        data: result,
      };
    }

    return {
      success: false,
      message: result.errorMessage ?? "Test webhook delivery failed.",
      error: result.errorMessage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test webhook failed.";
    return { success: false, message, error: message };
  }
}

// ─── getWebhookEvents ──────────────────────────────────────────

export async function getWebhookEvents(
  workspaceId: string,
  webhookId?: string,
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<ServiceResult<WebhookEventRow[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    let query = supabase
      .from("webhook_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (webhookId) {
      query = query.eq("webhook_id", webhookId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch webhook events", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch webhook events.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Retrieved ${(data ?? []).length} events.`,
      data: (data ?? []) as WebhookEventRow[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get webhook events.";
    return { success: false, message, error: message };
  }
}

// ─── retryWebhookEvent ─────────────────────────────────────────

export async function retryWebhookEvent(
  workspaceId: string,
  eventId: string
): Promise<ServiceResult<WebhookDeliveryResult>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    const { data: event, error: fetchError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("id", eventId)
      .eq("workspace_id", workspaceId)
      .single();

    if (fetchError || !event) {
      return {
        success: false,
        message: "Webhook event not found.",
        error: fetchError?.message,
      };
    }

    // Calculate exponential backoff delay
    const attempt = event.attempt_count + 1;
    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30_000);
    const nextRetry = new Date(Date.now() + backoffMs).toISOString();

    // Mark as retrying
    await supabase
      .from("webhook_events")
      .update({
        status: "retrying" as const,
        attempt_count: attempt,
        next_retry_at: nextRetry,
      })
      .eq("id", eventId);

    // Attempt delivery
    const result = await deliverWebhook({
      webhookId: event.webhook_id,
      eventType: event.event_type,
      payload: event.payload as Json,
    });

    // Update original event status
    await supabase
      .from("webhook_events")
      .update({
        status: result.success ? ("success" as const) : ("failed" as const),
        response_status: result.responseStatus,
        response_body: result.responseBody ?? null,
        error_message: result.errorMessage ?? null,
      })
      .eq("id", eventId);

    if (!result.success && attempt >= 3) {
      // Mark as dead letter after max retries
      await supabase
        .from("webhook_events")
        .update({ status: "dead" as const })
        .eq("id", eventId);

      return {
        success: false,
        message: "Event moved to dead letter queue after max retries.",
        error: result.errorMessage,
      };
    }

    return result.success
      ? {
          success: true,
          message: "Event delivered successfully on retry.",
          data: result,
        }
      : {
          success: false,
          message: `Retry attempt ${attempt} failed. ${attempt < 3 ? "Further retries available." : "Max retries reached."}`,
          error: result.errorMessage,
        };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry failed.";
    return { success: false, message, error: message };
  }
}

// ─── getWebhookStats ───────────────────────────────────────────

export async function getWebhookStats(
  workspaceId: string,
  webhookId?: string
): Promise<ServiceResult<WebhookStats>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await verifyWorkspaceMembership(workspaceId, profile.id);

    let query = supabase
      .from("webhook_events")
      .select("status, response_status, created_at")
      .eq("workspace_id", workspaceId);

    if (webhookId) {
      query = query.eq("webhook_id", webhookId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch webhook stats", { reason: error.message });
      return {
        success: false,
        message: "Failed to fetch webhook stats.",
        error: error.message,
      };
    }

    const rows = data ?? [];
    const totalEvents = rows.length;
    const successCount = rows.filter((r) => r.status === "success").length;
    const failureCount = rows.filter((r) => r.status === "failed" || r.status === "retrying").length;
    const deadLetterCount = rows.filter((r) => r.status === "dead").length;
    const successRate = totalEvents > 0 ? (successCount / totalEvents) * 100 : 0;

    // avgResponseTimeMs requires a duration_ms column on webhook_events to track actual response times
    const avgResponseTimeMs = null;

    const stats: WebhookStats = {
      totalEvents,
      successCount,
      failureCount,
      deadLetterCount,
      successRate: Math.round(successRate * 100) / 100,
      avgResponseTimeMs,
    };

    return {
      success: true,
      message: "Webhook stats retrieved.",
      data: stats,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get webhook stats.";
    return { success: false, message, error: message };
  }
}
