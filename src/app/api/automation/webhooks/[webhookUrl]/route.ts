/**
 * Supa AI — Phase 9A Automation — PUBLIC webhook receiver.
 *
 * POST `/api/automation/webhooks/[webhookUrl]`  — receive an inbound webhook
 *                                                and start the corresponding
 *                                                workflow.
 *
 * This route is PUBLIC — no auth gate. The caller is verified via the URL
 * slug (unique per `webhook_endpoints` row) + an optional HMAC-SHA256
 * signature over the body (when the endpoint has a `secret`).
 *
 * Returns:
 *   - 200 `{ accepted: true, runId: "..." }` on success.
 *   - 404 when the slug is unknown or the endpoint is inactive.
 *   - 401 when the signature verification fails.
 *
 * @module @/app/api/automation/webhooks/[webhookUrl]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { WorkflowExecutor } from "@/lib/automation/executor";
import { WebhookDispatcher } from "@/lib/automation/trigger-dispatcher";

interface RouteContext {
  params: Promise<{ webhookUrl: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const { webhookUrl } = await ctx.params;
    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND_ERROR", message: "Webhook endpoint not found." } },
        { status: 404 },
      );
    }

    // Read the raw body so HMAC verification is over the exact bytes.
    const rawBody = await req.text();
    let parsedBody: unknown = rawBody;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") && rawBody.length > 0) {
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // Keep rawBody as the payload — the workflow can decide.
      }
    }

    // Collect headers (lowercased).
    const headers: Record<string, string | string[] | undefined> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const supabase = createSupabaseAdminClient();
    const executor = new WorkflowExecutor(supabase);
    const dispatcher = new WebhookDispatcher(supabase, executor);

    try {
      const { runId } = await dispatcher.dispatchWebhook({
        urlSlug: webhookUrl,
        body: parsedBody,
        rawBody,
        headers,
      });
      return NextResponse.json(
        { success: true, data: { accepted: true, runId } },
        { status: 200 },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Invalid signature") {
        return NextResponse.json(
          { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid signature." } },
          { status: 401 },
        );
      }
      if (message.includes("was not found") || message.includes("not found")) {
        return NextResponse.json(
          { success: false, error: { code: "NOT_FOUND_ERROR", message: "Webhook endpoint not found." } },
          { status: 404 },
        );
      }
      throw err;
    }
  } catch (err) {
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred. Please try again." } },
      { status: 500 },
    );
  }
}
