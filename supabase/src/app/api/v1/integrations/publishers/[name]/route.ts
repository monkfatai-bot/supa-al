/**
 * Supa AI — Phase 10 Integration Hub — publisher profile.
 *
 * GET `/api/v1/integrations/publishers/[name]`
 *
 * @module @/app/api/v1/integrations/publishers/[name]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { name } = await ctx.params;
    const service = getMarketplaceService();
    const profile = await service.getPublisherProfile(name);
    return apiSuccess({ profile });
  } catch (err) {
    return apiError(err);
  }
}
