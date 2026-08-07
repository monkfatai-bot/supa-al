/**
 * Supa AI — Phase 9 workspace dashboard route.
 *
 * GET `/api/workspace/workspaces/:id/dashboard` — aggregate counts +
 *     recent activity + recent documents for the workspace overview.
 *
 * @module @/app/api/workspace/workspaces/[id]/dashboard/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createWorkspaceService } from "@/lib/workspace";
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
    if (!id) throw new NotFoundError("Workspace");

    const service = await createWorkspaceService();
    const dashboard = await service.getDashboard(id, user.id);
    return apiSuccess({ dashboard });
  } catch (err) {
    return apiError(err);
  }
}
