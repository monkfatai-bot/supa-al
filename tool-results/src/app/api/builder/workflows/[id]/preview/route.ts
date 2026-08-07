/**
 * Supa AI — Phase 9B Builder — preview run.
 *
 * POST `/api/builder/workflows/:id/preview`
 *      — run an in-memory simulation of the graph (no side effects).
 *
 * Body shape: see {@link previewSchema}.
 *
 * @module @/app/api/builder/workflows/[id]/preview/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { previewSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    // Auth check is still required even though preview is pure — keeps
    // the endpoint from being a public graph-evaluation surface.
    await requireAuth();
    const { id: workflowId } = await ctx.params;
    if (!workflowId) {
      return apiError(new Error("workflowId is required."), 400);
    }
    const input = validateInput(previewSchema, await req.json());

    const service = await createBuilderService();
    const result = service.previewWorkflow(
      {
        nodes: input.nodes.map((n) => ({
          nodeKey: n.nodeKey,
          nodeType: n.nodeType,
          category: n.category,
          label: n.label,
          config: n.config,
          isEnabled: n.isEnabled ?? true,
        })),
        edges: input.edges.map((e) => ({
          sourceNodeKey: e.sourceNodeKey,
          targetNodeKey: e.targetNodeKey,
        })),
      },
      input.initialVariables ?? {},
    );
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
