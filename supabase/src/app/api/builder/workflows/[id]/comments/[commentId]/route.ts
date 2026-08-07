/**
 * Supa AI — Phase 9B Builder — single-comment PATCH (resolve / edit).
 *
 * PATCH `/api/builder/workflows/:id/comments/:commentId?workspaceId=…`
 *      — update the comment's body, position, or resolved flag.
 *
 * @module @/app/api/builder/workflows/[id]/comments/[commentId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { updateCommentSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string; commentId: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowId, commentId } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workflowId || !workspaceId || !commentId) {
      return apiError(
        new Error("workflowId, workspaceId, and commentId are required."),
        400,
      );
    }
    const input = validateInput(updateCommentSchema, await req.json());

    const service = await createBuilderService();
    const comment = await service.updateComment(
      user.id,
      workspaceId,
      commentId,
      input,
    );
    return apiSuccess({ comment });
  } catch (err) {
    return apiError(err);
  }
}
