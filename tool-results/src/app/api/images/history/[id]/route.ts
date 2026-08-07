/**
 * Supa AI — Single image-generation route.
 *
 * GET    `/api/images/history/:id`  — fetch a single generation.
 * DELETE `/api/images/history/:id`  — hard-delete (removes the stored asset).
 *
 * Both require a valid session + ownership of the generation.
 *
 * @module @/app/api/images/history/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getImageService } from "@/lib/image";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("ImageGeneration");

    const service = getImageService();
    const generation = await service.getById(user.id, id);
    if (!generation) throw new NotFoundError("ImageGeneration", id);

    return apiSuccess({ generation });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("ImageGeneration");

    const service = getImageService();
    await service.delete(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
