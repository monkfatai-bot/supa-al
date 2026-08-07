/**
 * Supa AI — Phase 10 Integration Hub — webhook subscriptions list + create.
 *
 * GET  `/api/v1/integrations/webhooks?workspaceId=...`
 * POST `/api/v1/integrations/webhooks`
 *
 * @module @/app/api/v1/integrations/webhooks/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getWebhookManager } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import {
  createWebhookSubscriptionSchema,
  listWebhookSubscriptionsQuerySchema,
} from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const query = validateInput(listWebhookSubscriptionsQuerySchema, {
      integrationId: url.searchParams.get("integrationId") ?? undefined,
      isActive: url.searchParams.get("isActive") === "true" ? true : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const mgr = getWebhookManager();
    const subscriptions = await mgr.listSubscriptions({ workspaceId, ...query });
    return apiSuccess({ subscriptions });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(createWebhookSubscriptionSchema, body);
    const mgr = getWebhookManager();
    const subscription = await mgr.createSubscription({
      workspaceId,
      userId: user.id,
      data: input,
    });
    return apiSuccess({ subscription });
  } catch (err) {
    return apiError(err);
  }
}
