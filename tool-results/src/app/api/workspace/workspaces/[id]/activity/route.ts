/**
 * Supa AI — Phase 9 workspace activity feed route.
 *
 * GET `/api/workspace/workspaces/:id/activity` — paginated activity feed.
 *
 * @module @/app/api/workspace/workspaces/[id]/activity/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createActivityService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { listActivityQuerySchema } from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const url = new URL(req.url);
    const query = validateInput(listActivityQuerySchema, {
      resourceType: url.searchParams.get("resourceType") ?? undefined,
      resourceId: url.searchParams.get("resourceId") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createActivityService();
    const activity = await service.list(id, user.id, query);
    return apiSuccess({ activity });
  } catch (err) {
    return apiError(err);
  }
}
