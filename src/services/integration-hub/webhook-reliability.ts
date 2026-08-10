"use server";

/**
 * Category 16 — Webhook Reliability
 *
 * Extends the existing webhook-engine.ts with dead letter queue management,
 * idempotent delivery, combined delivery history, and purge operations.
 * All delivery/signature logic is delegated to webhook-engine.ts.
 */

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { logger } from "@/services/logger";
import { deliverWebhook } from "./webhook-engine";
import type { Json } from "@/types/generated/database";
import type { ServiceResult, WebhookDeliveryResult } from "./types";

// ─── Types ──────────────────────────────────────────────────────

export interface DeadLetterEntry {
  id: string;
  webhook_event_id: string;
  webhook_id: string;
  workspace_id: string;
  event_type: string;
  payload: Json;
  original_error: string;
  failure_reason: string;
  attempt_count: number;
  status: string;
  resolved_at: string | null;
  created_at: string;
}

interface ReplayResult {
  resolved: number;
  stillFailing: number;
}

type DeliveryTimelineEntry = {
  id: string;
  source: "event" | "dead_letter";
  webhook_id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  error_message: string | null;
  response_status: number | null;
  created_at: string;
};

interface IdempotentDeliveryParams {
  webhookId: string;
  eventType: string;
  payload: Json;
  idempotencyKey: string;
  workspaceId: string;
}

// ─── moveToDeadLetterQueue ───────────────────────────────────────

export async function moveToDeadLetterQueue(
  eventId: string,
  reason: string
): Promise<ServiceResult<DeadLetterEntry>> {
  try {
    const supabase = await createServerSupabaseClient();

    // Fetch the original event
    const { data: event, error: fetchError } = await supabase
      .from("webhook_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (fetchError || !event) {
      return {
        success: false,
        message: "Webhook event not found.",
        error: fetchError?.message,
      };
    }

    // Insert into dead letter queue
    const { data: deadLetter, error: insertError } = await supabase
      .from("webhook_dead_letters")
      .insert({
        webhook_event_id: event.id,
        webhook_id: event.webhook_id,
        workspace_id: event.workspace_id,
        event_type: event.event_type,
        payload: event.payload,
        original_error: event.error_message ?? "Unknown error",
        failure_reason: reason,
        attempt_count: event.attempt_count,
        status: "pending",
      })
      .select()
      .single();

    if (insertError || !deadLetter) {
      logger.error("Failed to move event to dead letter queue", {
        reason: insertError?.message,
      });
      return {
        success: false,
        message: "Failed to move event to dead letter queue.",
        error: insertError?.message,
      };
    }

    // Mark the original event as dead
    await supabase
      .from("webhook_events")
      .update({ status: "dead" as const })
      .eq("id", eventId);

    logger.info("Event moved to dead letter queue", {
      eventId,
      deadLetterId: deadLetter.id,
      reason,
    });

    return {
      success: true,
      message: "Event moved to dead letter queue.",
      data: deadLetter as unknown as DeadLetterEntry,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to move event to DLQ.";
    logger.error("moveToDeadLetterQueue error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── getDeadLetterQueue ─────────────────────────────────────────

export async function getDeadLetterQueue(
  workspaceId: string,
  webhookId?: string
): Promise<ServiceResult<DeadLetterEntry[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(workspaceId, profile.id, "admin");

    let query = supabase
      .from("webhook_dead_letters")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (webhookId) {
      query = query.eq("webhook_id", webhookId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error("Failed to fetch dead letter queue", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Failed to fetch dead letter queue.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: `Found ${(data ?? []).length} dead letter(s).`,
      data: (data ?? []) as unknown as DeadLetterEntry[],
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch dead letter queue.";
    return { success: false, message, error: message };
  }
}

// ─── replayDeadLetterEvent ──────────────────────────────────────

export async function replayDeadLetterEvent(
  deadLetterId: string
): Promise<ServiceResult<WebhookDeliveryResult>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Fetch the dead letter
    const { data: dl, error: fetchError } = await supabase
      .from("webhook_dead_letters")
      .select("*")
      .eq("id", deadLetterId)
      .single();

    if (fetchError || !dl) {
      return {
        success: false,
        message: "Dead letter entry not found.",
        error: fetchError?.message,
      };
    }

    // Require workspace admin
    await requireMinimumRole(dl.workspace_id, profile.id, "admin");

    // Increment attempt count before delivery
    const newAttemptCount = dl.attempt_count + 1;
    await supabase
      .from("webhook_dead_letters")
      .update({ attempt_count: newAttemptCount })
      .eq("id", deadLetterId);

    // Re-deliver using the existing webhook-engine logic
    const result = await deliverWebhook({
      webhookId: dl.webhook_id,
      eventType: dl.event_type,
      payload: dl.payload as Json,
    });

    if (result.success) {
      // Mark as resolved
      await supabase
        .from("webhook_dead_letters")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", deadLetterId);

      logger.info("Dead letter event resolved on replay", {
        deadLetterId,
        webhookId: dl.webhook_id,
      });

      return {
        success: true,
        message: "Dead letter event delivered successfully on replay.",
        data: result,
      };
    }

    logger.warn("Dead letter replay still failing", {
      deadLetterId,
      attemptCount: newAttemptCount,
      error: result.errorMessage,
    });

    return {
      success: false,
      message: `Replay attempt ${newAttemptCount} failed: ${result.errorMessage ?? "Unknown error"}`,
      error: result.errorMessage,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Dead letter replay failed.";
    logger.error("replayDeadLetterEvent error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── replayAllDeadLetters ───────────────────────────────────────

export async function replayAllDeadLetters(
  webhookId: string
): Promise<ServiceResult<ReplayResult>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Find the webhook to get the workspace
    const { data: webhook, error: whError } = await supabase
      .from("webhooks")
      .select("workspace_id")
      .eq("id", webhookId)
      .single();

    if (whError || !webhook) {
      return {
        success: false,
        message: "Webhook not found.",
        error: whError?.message,
      };
    }

    await requireMinimumRole(webhook.workspace_id, profile.id, "admin");

    // Fetch all unresolved dead letters for this webhook
    const { data: deadLetters, error: dlError } = await supabase
      .from("webhook_dead_letters")
      .select("*")
      .eq("webhook_id", webhookId)
      .neq("status", "resolved");

    if (dlError) {
      logger.error("Failed to fetch dead letters for replay", {
        reason: dlError.message,
      });
      return {
        success: false,
        message: "Failed to fetch dead letters.",
        error: dlError.message,
      };
    }

    const entries = deadLetters ?? [];
    const result: ReplayResult = { resolved: 0, stillFailing: 0 };

    for (const dl of entries) {
 const replayResult = await replayDeadLetterEvent(dl.id);
      if (replayResult.success) {
        result.resolved++;
      } else {
        result.stillFailing++;
      }
    }

    logger.info("Bulk dead letter replay completed", {
      webhookId,
      resolved: result.resolved,
      stillFailing: result.stillFailing,
    });

    return {
      success: true,
      message: `Replayed ${entries.length} dead letter(s): ${result.resolved} resolved, ${result.stillFailing} still failing.`,
      data: result,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bulk replay failed.";
    logger.error("replayAllDeadLetters error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── checkDuplicateEvent ────────────────────────────────────────

export async function checkDuplicateEvent(
  idempotencyKey: string
): Promise<ServiceResult<Record<string, unknown> | null>> {
  try {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("webhook_events")
      .select("id, webhook_id, event_type, status, response_status, created_at")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) {
      logger.error("Failed to check for duplicate event", {
        reason: error.message,
      });
      return {
        success: false,
        message: "Duplicate check failed.",
        error: error.message,
      };
    }

    return {
      success: true,
      message: data ? "Duplicate event found." : "No duplicate found.",
      data: data ?? null,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Duplicate check failed.";
    return { success: false, message, error: message };
  }
}

// ─── deliverWithIdempotency ─────────────────────────────────────

export async function deliverWithIdempotency(
  params: IdempotentDeliveryParams
): Promise<ServiceResult<WebhookDeliveryResult>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();
    await requireMinimumRole(params.workspaceId, profile.id, "admin");

    // Check for existing event with the same idempotency key
    const { data: existing, error: dupError } = await supabase
      .from("webhook_events")
      .select("id, status, response_status, created_at")
      .eq("idempotency_key", params.idempotencyKey)
      .maybeSingle();

    if (dupError) {
      logger.error("Idempotency check failed", { reason: dupError.message });
      return {
        success: false,
        message: "Idempotency check failed.",
        error: dupError.message,
      };
    }

    if (existing) {
      logger.info("Idempotent delivery: returning existing result", {
        idempotencyKey: params.idempotencyKey,
        existingEventId: existing.id,
        status: existing.status,
      });

      return {
        success: true,
        message: "Event already delivered (idempotent).",
        data: {
          success: existing.status === "success",
          responseStatus: existing.response_status ?? 0,
          durationMs: 0,
          errorMessage:
            existing.status !== "success"
              ? `Original status: ${existing.status}`
              : undefined,
        },
      };
    }

    // Deliver the webhook
    const result = await deliverWebhook({
      webhookId: params.webhookId,
      eventType: params.eventType,
      payload: params.payload,
    });

    // Set the idempotency key on the latest event for this webhook
    // (the event was already inserted by deliverWebhook)
    const { data: latestEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("webhook_id", params.webhookId)
      .eq("event_type", params.eventType)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestEvent) {
      await supabase
        .from("webhook_events")
        .update({ idempotency_key: params.idempotencyKey })
        .eq("id", latestEvent.id);
    }

    return {
      success: result.success,
      message: result.success
        ? "Webhook delivered (idempotent)."
        : result.errorMessage ?? "Webhook delivery failed.",
      data: result,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Idempotent delivery failed.";
    logger.error("deliverWithIdempotency error", { error: message });
    return { success: false, message, error: message };
  }
}

// ─── getDeliveryHistory ─────────────────────────────────────────

export async function getDeliveryHistory(
  webhookId: string,
  limit: number = 100
): Promise<ServiceResult<DeliveryTimelineEntry[]>> {
  try {
    const profile = await requireAuth();
    const supabase = await createServerSupabaseClient();

    // Resolve workspace from webhook
    const { data: webhook, error: whError } = await supabase
      .from("webhooks")
      .select("workspace_id")
      .eq("id", webhookId)
      .single();

    if (whError || !webhook) {
      return {
        success: false,
        message: "Webhook not found.",
        error: whError?.message,
      };
    }

    await requireMinimumRole(webhook.workspace_id, profile.id, "admin");

    // Fetch recent successful/failed webhook events
    const { data: events, error: evError } = await supabase
      .from("webhook_events")
      .select("id, event_type, status, attempt_count, error_message, response_status, created_at")
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (evError) {
      logger.error("Failed to fetch webhook events for history", {
        reason: evError.message,
      });
      return {
        success: false,
        message: "Failed to fetch delivery history.",
        error: evError.message,
      };
    }

    // Fetch dead letters for the same webhook
    const { data: deadLetters, error: dlError } = await supabase
      .from("webhook_dead_letters")
      .select("id, event_type, status, attempt_count, failure_reason, created_at")
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dlError) {
      logger.error("Failed to fetch dead letters for history", {
        reason: dlError.message,
      });
      return {
        success: false,
        message: "Failed to fetch delivery history.",
        error: dlError.message,
      };
    }

    // Combine and sort into a unified timeline
    const timeline: DeliveryTimelineEntry[] = [];

    for (const ev of events ?? []) {
      timeline.push({
        id: ev.id,
        source: "event",
        webhook_id: webhookId,
        event_type: ev.event_type,
        status: ev.status,
        attempt_count: ev.attempt_count,
        error_message: ev.error_message,
        response_status: ev.response_status,
        created_at: ev.created_at,
      });
    }

    for (const dl of deadLetters ?? []) {
      timeline.push({
        id: dl.id,
        source: "dead_letter",
        webhook_id: webhookId,
        event_type: dl.event_type,
        status: dl.status,
        attempt_count: dl.attempt_count,
        error_message: dl.failure_reason,
        response_status: null,
        created_at: dl.created_at,
      });
    }

    // Sort by created_at descending
    timeline.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Trim to requested limit
    const trimmed = timeline.slice(0, limit);

    return {
      success: true,
      message: `Delivery history with ${trimmed.length} entries.`,
      data: trimmed,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to get delivery history.";
    return { success: false, message, error: message };
  }
}

// ─── purgeResolvedDeadLetters ───────────────────────────────────

export async function purgeResolvedDeadLetters(
  daysOld: number = 30
): Promise<ServiceResult<{ deleted: number }>> {
  try {
    // Auth gate — ensures only authenticated users can trigger purge
    await requireAuth();
    const supabase = await createServerSupabaseClient();

    const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();

    // Resolve which workspace IDs we can act on via the service role
    const { data: toDelete, error: fetchError } = await supabase
      .from("webhook_dead_letters")
      .select("id, workspace_id")
      .eq("status", "resolved")
      .lt("resolved_at", cutoff);

    if (fetchError) {
      logger.error("Failed to fetch resolved dead letters for purge", {
        reason: fetchError.message,
      });
      return {
        success: false,
        message: "Failed to fetch dead letters for purge.",
        error: fetchError.message,
      };
    }

    const entries = toDelete ?? [];
    const ids = entries.map((e) => e.id);

    if (ids.length === 0) {
      return {
        success: true,
        message: "No resolved dead letters to purge.",
        data: { deleted: 0 },
      };
    }

    // Delete in batches of 100 to avoid URL length limits
    let deleted = 0;
    const BATCH_SIZE = 100;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const { error: deleteError, data: deletedRows } = await supabase
        .from("webhook_dead_letters")
        .delete()
        .in("id", batch)
        .select("id");

      if (deleteError) {
        logger.error("Failed to purge dead letter batch", {
          batch: i / BATCH_SIZE,
          reason: deleteError.message,
        });
        // Continue with remaining batches
        continue;
      }

      deleted += (deletedRows ?? []).length;
    }

    logger.info("Purged resolved dead letters", { deleted, daysOld });

    return {
      success: true,
      message: `Purged ${deleted} resolved dead letter(s) older than ${daysOld} days.`,
      data: { deleted },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to purge dead letters.";
    logger.error("purgeResolvedDeadLetters error", { error: message });
    return { success: false, message, error: message };
  }
}
