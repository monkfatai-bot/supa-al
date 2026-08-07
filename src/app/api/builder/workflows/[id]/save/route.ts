/**
 * Supa AI — Phase 9B Builder — save the entire graph.
 *
 * POST `/api/builder/workflows/:id/save`
 *      — atomically replace the graph (nodes + edges + layout).
 *
 * Body shape: see {@link saveWorkflowSchema}.
 *
 * @module @/app/api/builder/workflows/[id]/save/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { saveWorkflowSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowIdFromPath } = await ctx.params;
    const body = await req.json();
    // The workflow_id from the path wins — it's the source of truth.
    const workflowId = workflowIdFromPath || (body?.workflowId ?? "");
    if (!workflowId) {
      return apiError(new Error("workflowId is required."), 400);
    }
    const input = validateInput(saveWorkflowSchema, { ...body, workflowId });

    const service = await createBuilderService();
    const graph = await service.saveWorkflow(user.id, input);
    return apiSuccess({ graph });
  } catch (err) {
    return apiError(err);
  }
}

/** GET returns the full graph in one shot (nodes + edges + layout). */
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
    const graph = await service.loadWorkflow(user.id, workspaceId, workflowId);
    return apiSuccess({ graph });
  } catch (err) {
    return apiError(err);
  }
}
