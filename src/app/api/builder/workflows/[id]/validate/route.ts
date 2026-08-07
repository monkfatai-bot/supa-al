/**
 * Supa AI — Phase 9B Builder — validate the graph.
 *
 * POST `/api/builder/workflows/:id/validate`
 *      — return the list of validation issues (errors + warnings).
 *
 * Body shape: see {@link validateSchema}.
 *
 * @module @/app/api/builder/workflows/[id]/validate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { validateSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: workflowId } = await ctx.params;
    if (!workflowId) {
      return apiError(new Error("workflowId is required."), 400);
    }
    const input = validateInput(validateSchema, await req.json());

    const service = await createBuilderService();
    const result = service.validateWorkflow({
      nodes: input.nodes.map((n) => ({
        nodeKey: n.nodeKey,
        nodeType: n.nodeType,
        isEnabled: n.isEnabled ?? true,
      })),
      edges: input.edges.map((e) => ({
        sourceNodeKey: e.sourceNodeKey,
        targetNodeKey: e.targetNodeKey,
      })),
    });
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
