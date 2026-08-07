/**
 * Supa AI — Phase 10 Integration Hub — list installed apps.
 *
 * GET `/api/v1/integrations/install/list?workspaceId=...&status=...`
 *
 * @module @/app/api/v1/integrations/install/list/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { resolveWorkspaceId } from "../../_helpers";
import type { InstalledAppStatus } from "@/lib/integrations/client";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as InstalledAppStatus | null;
    const service = getMarketplaceService();
    const installed = await service.listInstalled({
      workspaceId,
      status: status ?? undefined,
    });
    return apiSuccess({ installed });
  } catch (err) {
    return apiError(err);
  }
}
