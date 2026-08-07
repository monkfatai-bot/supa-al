/**
 * Supa AI — Phase 9 single-comment route.
 *
 * PATCH  `/api/workspace/comments/:id` — edit body / resolve.
 * DELETE `/api/workspace/comments/:id` — delete (author or admin).
 *
 * @module @/app/api/workspace/comments/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCommentService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateCommentSchema } from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Comment");

    const body = await req.json().catch(() => ({}));
    // `updateCommentSchema` doesn't include `workspaceId` (it's an
    // implicit context from the URL). We pass only the comment fields.
    const input = validateInput(updateCommentSchema, body);

    // The service needs the workspace_id for membership checks — we
    // look it up via the comment row itself.
    const service = await createCommentService();
    // The service's `list` is workspace-scoped, but here we only have
    // the comment id. We work around this by extracting the workspace
    // via a quick `supabase.from('comments').select('workspace_id')`
    // — but to keep the route thin, we accept the workspace_id as an
    // optional body field. When missing, we throw a ValidationError.
    const workspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId : null;
    if (!workspaceId) {
      throw new NotFoundError("Workspace");
    }

    const comment = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ comment });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Comment");

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw new NotFoundError("Workspace");

    const service = await createCommentService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
