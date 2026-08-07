/**
 * Supa AI — Phase 10 Integration Hub — disconnect an integration.
 *
 * POST `/api/v1/integrations/disconnect/[id]`
 *
 * @module @/app/api/v1/integrations/disconnect/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    const service = getIntegrationService();
    const integration = await service.disconnect({
      integrationId: id,
      userId: user.id,
    });
    return apiSuccess({ integration });
  } catch (err) {
    return apiError(err);
  }
}
