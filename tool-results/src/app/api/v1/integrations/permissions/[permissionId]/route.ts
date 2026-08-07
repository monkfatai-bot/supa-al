/**
 * Supa AI — Phase 10 Integration Hub — revoke a permission.
 *
 * DELETE `/api/v1/integrations/permissions/[permissionId]`
 *
 * @module @/app/api/v1/integrations/permissions/[permissionId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ permissionId: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { permissionId } = await ctx.params;
    const service = getIntegrationService();
    await service.revokePermission({ permissionId, userId: user.id });
    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
