/**
 * Supa AI — Phase 10 Integration Hub — webhook deliveries list.
 *
 * GET `/api/v1/integrations/webhooks/deliveries?workspaceId=...`
 *
 * @module @/app/api/v1/integrations/webhooks/deliveries/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getWebhookManager } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { listWebhookDeliveriesQuerySchema } from "@/lib/validation/integrations";
import { resolveWorkspaceId } from "../../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const query = validateInput(listWebhookDeliveriesQuerySchema, {
      subscriptionId: url.searchParams.get("subscriptionId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const mgr = getWebhookManager();
    const deliveries = await mgr.listDeliveries({ workspaceId, ...query });
    return apiSuccess({ deliveries });
  } catch (err) {
    return apiError(err);
  }
}
