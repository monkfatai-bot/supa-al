/**
 * Supa AI — Phase 10 Integration Hub — health dashboard.
 *
 * GET `/api/v1/integrations/health?workspaceId=...` — aggregated health snapshot.
 *
 * @module @/app/api/v1/integrations/health/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { resolveWorkspaceId } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const service = getIntegrationService();
    const dashboard = await service.getHealthDashboard(workspaceId);
    return apiSuccess({ dashboard });
  } catch (err) {
    return apiError(err);
  }
}
