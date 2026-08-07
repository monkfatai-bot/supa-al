/**
 * Supa AI — Phase 10 Integration Hub — analytics.
 *
 * GET `/api/v1/integrations/analytics?workspaceId=...` — aggregated analytics.
 *
 * @module @/app/api/v1/integrations/analytics/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { analyticsQuerySchema } from "@/lib/validation/integrations";
import { resolveWorkspaceId } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const options = validateInput(analyticsQuerySchema, {
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = getIntegrationService();
    const analytics = await service.getAnalytics({ workspaceId, options });
    return apiSuccess({ analytics });
  } catch (err) {
    return apiError(err);
  }
}
