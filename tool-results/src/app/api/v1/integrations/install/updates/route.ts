/**
 * Supa AI — Phase 10 Integration Hub — install updates check.
 *
 * GET `/api/v1/integrations/install/updates?workspaceId=...` — list
 * installed apps with available updates.
 *
 * @module @/app/api/v1/integrations/install/updates/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { resolveWorkspaceId } from "../../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const service = getMarketplaceService();
    const updates = await service.checkForUpdates(workspaceId);
    return apiSuccess({ updates });
  } catch (err) {
    return apiError(err);
  }
}
