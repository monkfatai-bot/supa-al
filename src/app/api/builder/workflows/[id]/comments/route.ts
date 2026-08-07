/**
 * Supa AI — Phase 9B Builder — workflow comments.
 *
 * GET  `/api/builder/workflows/:id/comments?workspaceId=…`
 *      — list every comment on the canvas (oldest first).
 * POST `/api/builder/workflows/:id/comments`
 *      — create a new comment.
 *
 * @module @/app/api/builder/workflows/[id]/comments/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { createCommentSchema } from "@/lib/validation/builder";

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
    const comments = await service.listComments(user.id, workspaceId, workflowId);
    return apiSuccess({ comments });
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
    const input = validateInput(createCommentSchema, {
      ...body,
      workflowId,
    });

    const service = await createBuilderService();
    const comment = await service.createComment(user.id, input);
    return apiSuccess({ comment });
  } catch (err) {
    return apiError(err);
  }
}
