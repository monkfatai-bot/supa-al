/**
 * Supa AI — Phase 9A Automation — Webhook Trigger Dispatcher.
 *
 * The PUBLIC entry point for inbound webhooks. Unlike every other
 * automation surface, this module's API route has NO auth — anyone on
 * the internet can POST to `/api/automation/webhooks/[webhookUrl]`.
 *
 * Verification happens via the URL slug itself: each `webhook_endpoints`
 * row has a unique `url_slug` that the caller must know. An optional
 * `secret` on the row allows the caller to sign the request body
 * (HMAC-SHA256 over the raw body) so that a leaked slug alone is not
 * enough to trigger a run.
 *
 * Server-only.
 *
 * @module @/lib/automation/trigger-dispatcher
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  DatabaseError,
  NotFoundError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import { WorkflowExecutor } from "./executor";
import { runQueue } from "./queue";
import type {
  DispatchWebhookInput,
  WebhookEndpoint,
  Workflow,
  WorkflowRun,
} from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Postgres-safe JSON value (mirrors the local type in supabase/types). */
type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

function toDbError(
  error: { code?: string; message?: string; name?: string; details?: unknown },
  message: string,
): DatabaseError {
  return new DatabaseError(message, {
    errorCode: error.code,
    errorName: error.name,
    errorMessage: error.message,
    errorDetails: error.details,
  });
}

function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as unknown as Json;
  return value as Json;
}

/**
 * Verify the request signature against the endpoint's secret. When the
 * endpoint has no secret configured, verification is skipped (the URL
 * slug alone is treated as enough — convenient for low-stakes integrations).
 *
 * The signature is HMAC-SHA256 over the raw body, hex-encoded. The
 * caller can send it either in the `X-Webhook-Signature` header (hex)
 * or as a `?signature=` query param.
 */
function verifySignature(
  bodyString: string,
  secret: string,
  headers: Record<string, string | string[] | undefined>,
): boolean {
  if (!secret) return true;
  const sigHeader = headers["x-webhook-signature"];
  const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!sig || typeof sig !== "string") return false;
  const expected = createHmac("sha256", secret).update(bodyString).digest("hex");
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook dispatcher
// ---------------------------------------------------------------------------

/**
 * Server-only webhook dispatcher. Constructed with the admin client.
 */
export class WebhookDispatcher {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    private readonly executor: WorkflowExecutor,
    private readonly queue = runQueue,
  ) {}

  /**
   * Handle an inbound webhook request. Returns the new run id when the
   * webhook was accepted and a run was queued.
   *
   * Throws:
   *   - {@link NotFoundError} when the slug is unknown or the endpoint
   *     is inactive.
   *   - {@link DatabaseError} when the underlying DB write fails.
   *   - An `Error` (with `message === 'Invalid signature'`) when the
   *     signature verification fails.
   */
  async dispatchWebhook(input: DispatchWebhookInput): Promise<{ runId: string }> {
    const { urlSlug, body, headers = {} } = input;
    if (!urlSlug) throw new NotFoundError("WebhookEndpoint");

    let endpoint: WebhookEndpoint | null;
    let workflow: Workflow | null;
    try {
      const { data: epRow, error: epErr } = await this.supabase
        .from("webhook_endpoints")
        .select()
        .eq("url_slug", urlSlug)
        .eq("is_active", true)
        .maybeSingle();
      if (epErr) throw toDbError(epErr, "webhook.loadEndpoint failed");
      endpoint = epRow as unknown as WebhookEndpoint | null;
      if (!endpoint) throw new NotFoundError("WebhookEndpoint", urlSlug);

      // Verify the signature (when a secret is set).
      const bodyString = typeof body === "string" ? body : JSON.stringify(body ?? {});
      if (!verifySignature(bodyString, endpoint.secret, headers)) {
        throw new Error("Invalid signature");
      }

      // Look up the parent workflow.
      const { data: wfRow, error: wfErr } = await this.supabase
        .from("workflows")
        .select()
        .eq("id", endpoint.workflow_id)
        .maybeSingle();
      if (wfErr) throw toDbError(wfErr, "webhook.loadWorkflow failed");
      workflow = wfRow as unknown as Workflow | null;
      if (!workflow) throw new NotFoundError("Workflow", endpoint.workflow_id);
      if (workflow.status !== "active") {
        // Quietly accept the webhook but don't start a run — the caller
        // gets a 200 so they don't keep retrying.
        logger.info("automation.webhook.workflow_inactive", {
          webhookId: endpoint.id,
          workflowId: endpoint.workflow_id,
        });
        return { runId: "" };
      }
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      if (err instanceof Error && err.message === "Invalid signature") throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("webhook.dispatchWebhook failed", {
        urlSlug,
        cause: appErr.message,
      });
    }

    // Insert the run with the webhook body as the payload.
    const payload = typeof body === "string" ? safeParse(body) : body;
    const insert = {
      workspace_id: endpoint.workspace_id,
      workflow_id: endpoint.workflow_id,
      trigger_id: null,
      status: "pending" as const,
      metadata: toJson({
        payload,
        webhook: {
          endpointId: endpoint.id,
          urlSlug: endpoint.url_slug,
        },
      }),
    };
    const { data: runRow, error: runErr } = await this.supabase
      .from("workflow_runs")
      .insert(insert as never)
      .select()
      .single();
    if (runErr) throw toDbError(runErr, "webhook.insertRun failed");
    const run = runRow as unknown as WorkflowRun;

    // Enqueue for background processing.
    this.queue.enqueue(this.executor, run.id);
    return { runId: run.id };
  }
}

/**
 * Best-effort `JSON.parse`. Returns the input string unchanged when the
 * body is not valid JSON (so the run's `metadata.payload` is still a
 * string the workflow can read).
 */
function safeParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}
