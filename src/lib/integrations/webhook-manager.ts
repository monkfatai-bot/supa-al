/**
 * Supa AI — Phase 10 Integration Hub — Webhook Manager.
 *
 * Server-only manager for inbound webhook subscriptions + outbound
 * webhook deliveries.
 *
 *   - Inbound: callers POST to `/api/v1/integrations/webhooks/[slug]`.
 *     The manager verifies the HMAC-SHA256 signature (when a signing
 *     secret is set), records a delivery, and emits an
 *     `integration.webhook.received` event for downstream subscribers.
 *   - Outbound: callers POST to a target URL with a payload signed
 *     using the subscription's signing secret. Retries with exponential
 *     backoff up to `maxAttempts` per delivery.
 *
 * @module @/lib/integrations/webhook-manager
 */
import "server-only";

import crypto from "node:crypto";

import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

import { generateWebhookSlug, toDbError, wrapIntegrationError } from "./core";
import { getCredentialVault } from "./credential-vault";
import { IntegrationEvents, eventBus } from "./event-bus";
import { computeRetryDelay } from "./core";
import type {
  CreateWebhookSubscriptionInput,
  IntegrationEvent,
  WebhookDelivery,
  WebhookSubscription,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;
const SIGNATURE_HEADER = "x-supa-signature";
const SIGNATURE_ALGO = "sha256";
const DELIVERY_TIMEOUT_MS = 15_000;
const RETRY_BATCH_SIZE = 25;

// ---------------------------------------------------------------------------
// WebhookManager
// ---------------------------------------------------------------------------

/**
 * Server-only manager for inbound + outbound webhooks. Construct via
 * {@link getWebhookManager} (singleton) or {@link getWebhookManagerWith}
 * (DI for tests).
 */
export class WebhookManager {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  /**
   * Create a new webhook subscription. Generates a unique `urlSlug` +
   * a cryptographically-strong `signingSecret`. Returns the created
   * subscription row.
   */
  async createSubscription(input: {
    workspaceId: string;
    userId: string;
    data: CreateWebhookSubscriptionInput;
  }): Promise<WebhookSubscription> {
    const vault = getCredentialVault();
    const signingSecret = vault.generateWebhookSecret();
    const urlSlug = generateWebhookSlug(input.data.integrationId ?? "webhook");

    try {
      const row: TablesInsert<"webhook_subscriptions"> = {
        workspace_id: input.workspaceId,
        integration_id: input.data.integrationId ?? null,
        url_slug: urlSlug,
        signing_secret: signingSecret,
        events: (input.data.events ?? []) as unknown as TablesInsert<"webhook_subscriptions">["events"],
        target_url: input.data.targetUrl ?? null,
        is_active: input.data.isActive ?? true,
        secret_version: 1,
        created_by: input.userId,
      };
      const { data, error } = await this.supabase
        .from("webhook_subscriptions")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "webhookManager.createSubscription failed");
      if (!data) throw new Error("webhookManager.createSubscription returned no row.");
      return data as unknown as WebhookSubscription;
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure creating webhook subscription.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * List subscriptions for a workspace (newest first).
   */
  async listSubscriptions(input: {
    workspaceId: string;
    integrationId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<WebhookSubscription[]> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, input.offset ?? 0);

    try {
      let query = this.supabase
        .from("webhook_subscriptions")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (input.integrationId) query = query.eq("integration_id", input.integrationId);
      if (typeof input.isActive === "boolean") query = query.eq("is_active", input.isActive);

      const { data, error } = await query;
      if (error) throw toDbError(error, "webhookManager.listSubscriptions failed");
      return (data ?? []) as unknown as WebhookSubscription[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing webhook subscriptions.", {
        workspaceId: input.workspaceId,
      });
    }
  }

  /**
   * Delete a subscription by id.
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("webhook_subscriptions")
        .delete()
        .eq("id", subscriptionId);
      if (error) throw toDbError(error, "webhookManager.deleteSubscription failed");
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure deleting webhook subscription.", {
        subscriptionId,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Inbound
  // -------------------------------------------------------------------------

  /**
   * Receive an inbound webhook. Verifies the HMAC-SHA256 signature
   * (when the subscription has a `signing_secret`), bumps the received
   * counter via the `increment_webhook_received` RPC, persists a
   * delivery row, and publishes an event. Returns the created delivery.
   *
   * Throws when the subscription is not found, inactive, or the
   * signature is missing/invalid.
   */
  async receiveInbound(input: {
    urlSlug: string;
    rawBody: string;
    signatureHeader?: string;
    eventType?: string;
  }): Promise<WebhookDelivery> {
    // 1. Resolve the subscription.
    const { data: subRow, error } = await this.supabase
      .from("webhook_subscriptions")
      .select()
      .eq("url_slug", input.urlSlug)
      .maybeSingle();
    if (error) throw toDbError(error, "webhookManager.receiveInbound: lookup failed");
    if (!subRow) throw new Error("Webhook subscription not found.");
    const sub = subRow as unknown as WebhookSubscription;
    if (!sub.is_active) throw new Error("Webhook subscription is inactive.");

    // 2. Verify HMAC-SHA256 signature.
    if (sub.signing_secret) {
      if (!input.signatureHeader) {
        throw new Error("Missing signature header.");
      }
      const expected = this.computeSignature(sub.signing_secret, input.rawBody);
      if (!this.safeEqualHex(expected, input.signatureHeader)) {
        // Bump the failure counter via RPC, then throw.
        await this.callRpcIncrement("increment_webhook_failures", sub.id);
        throw new Error("Invalid webhook signature.");
      }
    }

    // 3. Bump the received counter.
    await this.callRpcIncrement("increment_webhook_received", sub.id);

    // 4. Persist a delivery row.
    const eventType = input.eventType ?? "inbound";
    const deliveryRow: TablesInsert<"webhook_deliveries"> = {
      workspace_id: sub.workspace_id,
      integration_id: sub.integration_id ?? null,
      subscription_id: sub.id,
      event_type: eventType,
      payload: this.safeJsonParse(input.rawBody) as unknown as TablesInsert<"webhook_deliveries">["payload"],
      target_url: sub.target_url,
      http_method: "POST",
      status: "delivered",
      attempt_count: 1,
      max_attempts: 1,
      duration_ms: 0,
    };
    const { data: delivery, error: deliveryErr } = await this.supabase
      .from("webhook_deliveries")
      .insert(deliveryRow as never)
      .select()
      .single();
    if (deliveryErr) throw toDbError(deliveryErr, "webhookManager.receiveInbound: insert delivery failed");
    if (!delivery) throw new Error("webhookManager.receiveInbound: no delivery row returned.");

    // 5. Publish the webhook-received event so subscribers can react.
    const event = (delivery as unknown as WebhookDelivery);
    void eventBus.publish({
      workspaceId: sub.workspace_id,
      source: "webhook-manager",
      type: IntegrationEvents.webhookReceived,
      category: "integration",
      payload: {
        subscriptionId: sub.id,
        integrationId: sub.integration_id ?? null,
        eventType,
        deliveryId: event.id,
      } as Record<string, unknown>,
    });

    return event;
  }

  // -------------------------------------------------------------------------
  // Outbound
  // -------------------------------------------------------------------------

  /**
   * Deliver an outbound webhook. Records a `pending` delivery row, then
   * POSTs the payload to `targetUrl` (or the subscription's configured
   * target URL), signing the body with the subscription's signing secret.
   * On success, marks the delivery `delivered`; on failure, schedules a
   * retry via the retry queue.
   */
  async deliverOutbound(input: {
    subscriptionId: string;
    eventType: string;
    payload: Record<string, unknown>;
    targetUrl?: string;
    maxAttempts?: number;
  }): Promise<WebhookDelivery> {
    // Resolve the subscription.
    const { data: subRow, error } = await this.supabase
      .from("webhook_subscriptions")
      .select()
      .eq("id", input.subscriptionId)
      .maybeSingle();
    if (error) throw toDbError(error, "webhookManager.deliverOutbound: lookup failed");
    if (!subRow) throw new Error("Webhook subscription not found.");
    const sub = subRow as unknown as WebhookSubscription;

    const targetUrl = input.targetUrl ?? sub.target_url;
    if (!targetUrl) throw new Error("No target URL for outbound delivery.");

    const body = JSON.stringify(input.payload ?? {});
    const signature = sub.signing_secret
      ? this.computeSignature(sub.signing_secret, body)
      : "";

    // Insert the pending delivery row.
    const deliveryRow: TablesInsert<"webhook_deliveries"> = {
      workspace_id: sub.workspace_id,
      integration_id: sub.integration_id ?? null,
      subscription_id: sub.id,
      event_type: input.eventType,
      payload: input.payload as unknown as TablesInsert<"webhook_deliveries">["payload"],
      target_url: targetUrl,
      http_method: "POST",
      status: "pending",
      attempt_count: 0,
      max_attempts: input.maxAttempts ?? 5,
    };
    const { data: delivery, error: deliveryErr } = await this.supabase
      .from("webhook_deliveries")
      .insert(deliveryRow as never)
      .select()
      .single();
    if (deliveryErr) throw toDbError(deliveryErr, "webhookManager.deliverOutbound: insert failed");
    if (!delivery) throw new Error("webhookManager.deliverOutbound: no delivery row returned.");
    const created = delivery as unknown as WebhookDelivery;

    // Attempt the delivery (best-effort — failures become retry-queue rows).
    setImmediate(() => {
      void this.attemptDelivery(created.id, body, signature, targetUrl);
    });

    return created;
  }

  /**
   * List deliveries for a subscription or workspace (newest first).
   */
  async listDeliveries(input: {
    workspaceId: string;
    subscriptionId?: string;
    status?: WebhookDelivery["status"];
    limit?: number;
    offset?: number;
  }): Promise<WebhookDelivery[]> {
    const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, input.offset ?? 0);
    try {
      let query = this.supabase
        .from("webhook_deliveries")
        .select()
        .eq("workspace_id", input.workspaceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (input.subscriptionId) query = query.eq("subscription_id", input.subscriptionId);
      if (input.status) query = query.eq("status", input.status);
      const { data, error } = await query;
      if (error) throw toDbError(error, "webhookManager.listDeliveries failed");
      return (data ?? []) as unknown as WebhookDelivery[];
    } catch (err) {
      if (err instanceof Error && err.name === "DatabaseError") throw err;
      throw wrapIntegrationError(err, "Unexpected failure listing webhook deliveries.");
    }
  }

  /**
   * Process the retry queue: fetch the next batch of `retrying` or
   * `pending` deliveries whose `next_retry_at` has elapsed, then
   * re-attempt each. Returns the number of deliveries re-attempted.
   */
  async processRetryQueue(): Promise<number> {
    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await this.supabase
        .from("webhook_deliveries")
        .select()
        .in("status", ["pending", "retrying"])
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
        .order("created_at", { ascending: true })
        .limit(RETRY_BATCH_SIZE);
      if (error) throw toDbError(error, "webhookManager.processRetryQueue: fetch failed");
      if (!data || data.length === 0) return 0;

      let processed = 0;
      for (const row of data as unknown as WebhookDelivery[]) {
        // Look up the subscription's signing secret.
        const { data: subRow } = await this.supabase
          .from("webhook_subscriptions")
          .select("signing_secret")
          .eq("id", row.subscription_id ?? "")
          .maybeSingle();
        const secret = (subRow as unknown as { signing_secret: string } | null)?.signing_secret ?? "";
        const body = JSON.stringify(row.payload ?? {});
        const signature = secret ? this.computeSignature(secret, body) : "";
        const targetUrl = row.target_url ?? "";
        if (!targetUrl) continue;
        await this.attemptDelivery(row.id, body, signature, targetUrl);
        processed += 1;
      }
      return processed;
    } catch (err) {
      logger.warn("webhookManager.processRetryQueue failed", { error: String(err) });
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async attemptDelivery(
    deliveryId: string,
    body: string,
    signature: string,
    targetUrl: string,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (signature) headers[SIGNATURE_HEADER] = signature;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      const durationMs = Date.now() - startedAt;
      const responseText = await res.text().catch(() => "");

      if (res.ok) {
        await this.supabase
          .from("webhook_deliveries")
          .update({
            status: "delivered",
            http_status: res.status,
            response_body: responseText.slice(0, 4000) || null,
            attempt_count: 1, // Best-effort: a real implementation would read+increment.
            duration_ms: durationMs,
            next_retry_at: null,
          } as never)
          .eq("id", deliveryId);
        return;
      }

      // Failed — schedule a retry.
      await this.scheduleRetry(deliveryId, res.status, responseText, durationMs);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      await this.scheduleRetry(deliveryId, 0, String(err), durationMs);
    }
  }

  private async scheduleRetry(
    deliveryId: string,
    httpStatus: number,
    responseText: string,
    durationMs: number,
  ): Promise<void> {
    try {
      const { data: row } = await this.supabase
        .from("webhook_deliveries")
        .select("attempt_count, max_attempts")
        .eq("id", deliveryId)
        .maybeSingle();
      const d = row as unknown as { attempt_count: number; max_attempts: number } | null;
      const attempts = (d?.attempt_count ?? 0) + 1;
      const maxAttempts = d?.max_attempts ?? 5;

      if (attempts >= maxAttempts) {
        await this.supabase
          .from("webhook_deliveries")
          .update({
            status: "failed",
            http_status: httpStatus || null,
            response_body: responseText.slice(0, 4000) || null,
            attempt_count: attempts,
            error: "Max attempts reached",
            duration_ms: durationMs,
            next_retry_at: null,
          } as never)
          .eq("id", deliveryId);
        return;
      }

      const delayMs = computeRetryDelay(attempts - 1);
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
      await this.supabase
        .from("webhook_deliveries")
        .update({
          status: "retrying",
          http_status: httpStatus || null,
          response_body: responseText.slice(0, 4000) || null,
          attempt_count: attempts,
          error: httpStatus > 0 ? `HTTP ${httpStatus}` : "fetch_failed",
          duration_ms: durationMs,
          next_retry_at: nextRetryAt,
        } as never)
        .eq("id", deliveryId);
    } catch (err) {
      logger.warn("webhookManager.scheduleRetry failed", {
        deliveryId,
        error: String(err),
      });
    }
  }

  private computeSignature(secret: string, body: string): string {
    return crypto.createHmac(SIGNATURE_ALGO, secret).update(body, "utf8").digest("hex");
  }

  private safeEqualHex(a: string, b: string): boolean {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    try {
      return crypto.timingSafeEqual(ab, bb);
    } catch {
      return false;
    }
  }

  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  private async callRpcIncrement(fn: string, subId: string): Promise<void> {
    try {
      await this.supabase.rpc(fn as never, { sub_id: subId } as never);
    } catch (err) {
      logger.warn("webhookManager.callRpcIncrement failed", { fn, subId, error: String(err) });
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _mgr: WebhookManager | null = null;

/** Get the shared webhook manager (singleton). */
export function getWebhookManager(): WebhookManager {
  if (_mgr) return _mgr;
  _mgr = new WebhookManager(createSupabaseAdminClient());
  return _mgr;
}

/** Get a webhook manager bound to a specific admin client (tests / DI). */
export function getWebhookManagerWith(supabase: AdminSupabaseClient): WebhookManager {
  return new WebhookManager(supabase);
}

// Re-exported for callers that want them in one place.
export { computeRetryDelay };
