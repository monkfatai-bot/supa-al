/**
 * Supa AI — Phase 9B Builder — list + add nodes for a workflow.
 *
 * GET  `/api/builder/workflows/:id/nodes?workspaceId=…`
 *      — list every node on the canvas.
 * POST `/api/builder/workflows/:id/nodes`
 *      — bulk-insert new nodes (the body carries `nodes[]`).
 *
 * @module @/app/api/builder/workflows/[id]/nodes/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { addNodesSchema } from "@/lib/validation/builder";

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
    const nodes = await service.listNodes(user.id, workspaceId, workflowId);
    return apiSuccess({ nodes });
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
    const input = validateInput(addNodesSchema, body);

    const service = await createBuilderService();
    const nodes = await service.addNodes(
      user.id,
      workspaceId,
      workflowId,
      input.nodes.map((n) => ({
        nodeKey: n.nodeKey,
        nodeType: n.nodeType,
        category: n.category,
        label: n.label,
        position: n.position,
        config: n.config,
        isEnabled: n.isEnabled,
      })),
    );
    return apiSuccess({ nodes });
  } catch (err) {
    return apiError(err);
  }
}
