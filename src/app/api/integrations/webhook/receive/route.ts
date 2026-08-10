import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { verifyWebhookSignature } from "@/services/integration-hub/webhook-engine";
import { publishEvent } from "@/services/integration-hub/event-bus";
import { logger } from "@/services/logger";

export async function POST(request: NextRequest) {
  try {
    // Read headers
    const signature = request.headers.get("X-Webhook-Signature") ?? "";
    const timestamp = request.headers.get("X-Webhook-Timestamp") ?? "";
    const webhookId = request.headers.get("X-Webhook-Id") ?? "";

    if (!webhookId) {
      return NextResponse.json(
        { error: "Missing X-Webhook-Id header." },
        { status: 400 }
      );
    }

    // Read request body
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    // Look up the webhook by X-Webhook-Id
    const supabase = await createServerSupabaseClient();
    const { data: webhook, error: fetchError } = await supabase
      .from("webhooks")
      .select("id, secret, workspace_id, status")
      .eq("id", webhookId)
      .eq("status", "active")
      .single();

    if (fetchError || !webhook) {
      return NextResponse.json(
        { error: "Webhook not found." },
        { status: 404 }
      );
    }

    // Verify signature if provided
    if (signature) {
      const isValid = verifyWebhookSignature({
        payload,
        signature,
        secret: webhook.secret,
      });

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature." },
          { status: 401 }
        );
      }
    }

    // Record incoming webhook event in integration_logs
    await supabase.from("integration_logs").insert({
      workspace_id: webhook.workspace_id,
      action: "webhook:received",
      direction: "inbound",
      request: {
        webhookId: webhook.id,
        payload,
        signature: signature ? "verified" : "none",
        timestamp,
      },
      status: "success",
    });

    // Determine event type from payload or default to "webhook.received"
    const eventType =
      (payload as Record<string, unknown>)?.type as string ??
      "webhook.received";

    // Publish event via event bus
    await publishEvent({
      workspaceId: webhook.workspace_id,
      eventType,
      payload: payload as Parameters<typeof publishEvent>[0]["payload"],
      source: "webhook:received",
    });

    return NextResponse.json({ received: true, eventType });
  } catch (err) {
    logger.error("Webhook receiver error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
