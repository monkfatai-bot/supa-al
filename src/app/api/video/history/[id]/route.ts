/**
 * Supa AI — Single video generation route.
 *
 * GET    `/api/video/history/:id`  — fetch a single generation (ownership enforced).
 * DELETE `/api/video/history/:id`  — hard-delete (cascades to its `video_jobs` rows).
 *
 * @module @/app/api/video/history/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoService } from "@/lib/video";
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
    if (!id) throw new NotFoundError("VideoGeneration");

    const service = await createVideoService();
    const generation = await service.getById(user.id, id);
    if (!generation) throw new NotFoundError("VideoGeneration", id);

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
    if (!id) throw new NotFoundError("VideoGeneration");

    const service = await createVideoService();
    await service.delete(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
