/**
 * Supa AI — Phase 10 Integration Hub — single integration health check.
 *
 * POST `/api/v1/integrations/health/[id]` — run a fresh health check + persist.
 *
 * @module @/app/api/v1/integrations/health/[id]/route
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
    await requireAuth();
    const { id } = await ctx.params;
    const service = getIntegrationService();
    const health = await service.checkHealth(id);
    return apiSuccess({ health });
  } catch (err) {
    return apiError(err);
  }
}
