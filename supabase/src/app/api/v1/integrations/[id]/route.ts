/**
 * Supa AI — Phase 10 Integration Hub — integration CRUD by id route.
 *
 * GET    `/api/v1/integrations/[id]` — fetch single integration.
 * PATCH  `/api/v1/integrations/[id]` — patch fields.
 * DELETE `/api/v1/integrations/[id]` — hard-delete.
 *
 * @module @/app/api/v1/integrations/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { updateIntegrationSchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../_helpers";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const service = getIntegrationService();
    const integration = await service.get(id);
    if (!integration) {
      return apiError(new Error("Integration not found."), 404);
    }
    return apiSuccess({ integration });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    const body = await parseJsonBody(req);
    const input = validateInput(updateIntegrationSchema, body);

    const service = getIntegrationService();
    const integration = await service.update(id, input);
    return apiSuccess({ integration });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    const service = getIntegrationService();
    await service.delete(id);
    return apiSuccess({ ok: true, deletedBy: user.id });
  } catch (err) {
    return apiError(err);
  }
}
