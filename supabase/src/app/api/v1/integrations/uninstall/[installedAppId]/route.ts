/**
 * Supa AI — Phase 10 Integration Hub — uninstall an app.
 *
 * DELETE `/api/v1/integrations/uninstall/[installedAppId]`
 *
 * @module @/app/api/v1/integrations/uninstall/[installedAppId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ installedAppId: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { installedAppId } = await ctx.params;
    const service = getMarketplaceService();
    await service.uninstallApp({ installedAppId, userId: user.id });
    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
