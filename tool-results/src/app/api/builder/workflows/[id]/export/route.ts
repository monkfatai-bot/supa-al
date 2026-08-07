/**
 * Supa AI — Phase 9B Builder — export the workflow as JSON.
 *
 * GET `/api/builder/workflows/:id/export?workspaceId=…`
 *      — return a portable JSON payload (version 1) of the entire graph.
 *
 * @module @/app/api/builder/workflows/[id]/export/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowId } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workflowId || !workspaceId) {
      return apiError(new Error("workflowId and workspaceId are required."), 400);
    }

    const service = await createBuilderService();
    const exportPayload = await service.exportWorkflow(
      user.id,
      workspaceId,
      workflowId,
    );
    return apiSuccess({ export: exportPayload });
  } catch (err) {
    return apiError(err);
  }
}
