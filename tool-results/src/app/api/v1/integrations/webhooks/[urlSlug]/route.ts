/**
 * Supa AI — Phase 10 Integration Hub — inbound webhook receiver.
 *
 * POST `/api/v1/integrations/webhooks/[urlSlug]` — PUBLIC endpoint
 * that third-party services POST to. Verifies the HMAC-SHA256 signature
 * (when the subscription has a `signing_secret`), records a delivery,
 * and emits an `integration.webhook.received` event.
 *
 * @module @/app/api/v1/integrations/webhooks/[urlSlug]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getWebhookManager } from "@/lib/integrations";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ urlSlug: string }> },
): Promise<NextResponse> {
  try {
    const { urlSlug } = await ctx.params;
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get("x-supa-signature") ??
      req.headers.get("X-Supa-Signature") ??
      undefined;
    const eventType =
      req.headers.get("x-supa-event") ??
      req.headers.get("X-Supa-Event") ??
      req.headers.get("x-event-type") ??
      undefined;

    const mgr = getWebhookManager();
    const delivery = await mgr.receiveInbound({
      urlSlug,
      rawBody,
      signatureHeader,
      eventType: eventType ?? undefined,
    });
    return apiSuccess({ delivery });
  } catch (err) {
    return apiError(err);
  }
}
