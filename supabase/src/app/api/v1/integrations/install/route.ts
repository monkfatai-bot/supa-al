/**
 * Supa AI — Phase 10 Integration Hub — install app into workspace.
 *
 * POST `/api/v1/integrations/install` — install an app.
 *
 * @module @/app/api/v1/integrations/install/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { installAppSchema } from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "../_helpers";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(installAppSchema, body);

    const service = getMarketplaceService();
    const installed = await service.installApp({
      workspaceId,
      userId: user.id,
      data: input,
    });
    return apiSuccess({ installed });
  } catch (err) {
    return apiError(err);
  }
}
