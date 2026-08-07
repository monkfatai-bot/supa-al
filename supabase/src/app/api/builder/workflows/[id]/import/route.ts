/**
 * Supa AI — Phase 9B Builder — import a workflow from JSON.
 *
 * POST `/api/builder/workflows/:id/import?workspaceId=…`
 *      — replace the existing graph with the import payload.
 *
 * Body shape: see {@link importWorkflowSchema} (a WorkflowExport v1 payload).
 *
 * The path's `:id` is the *target* workflow id — the export payload's own
 * `workflowId` is rewritten to the path's id so callers can clone a
 * workflow into a new id by POSTing to a different path.
 *
 * @module @/app/api/builder/workflows/[id]/import/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { importWorkflowSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
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
    const body = await req.json();
    const input = validateInput(importWorkflowSchema, {
      ...body,
      workflowId, // force the path's workflowId
    });

    const service = await createBuilderService();
    const result = await service.importWorkflow(user.id, workspaceId, input);
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
