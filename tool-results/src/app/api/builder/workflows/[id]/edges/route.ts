/**
 * Supa AI — Phase 9B Builder — list + add edges for a workflow.
 *
 * GET  `/api/builder/workflows/:id/edges?workspaceId=…`
 *      — list every edge on the canvas.
 * POST `/api/builder/workflows/:id/edges`
 *      — bulk-insert new edges (the body carries `edges[]`).
 *
 * @module @/app/api/builder/workflows/[id]/edges/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { addEdgesSchema } from "@/lib/validation/builder";

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
    const edges = await service.listEdges(user.id, workspaceId, workflowId);
    return apiSuccess({ edges });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowId } = await ctx.params;
    const body = await req.json();
    const workspaceId = (body?.workspaceId ?? "") as string;
    if (!workflowId || !workspaceId) {
      return apiError(new Error("workflowId and workspaceId are required."), 400);
    }
    const input = validateInput(addEdgesSchema, body);

    const service = await createBuilderService();
    const edges = await service.addEdges(user.id, workspaceId, workflowId, input.edges);
    return apiSuccess({ edges });
  } catch (err) {
    return apiError(err);
  }
}
