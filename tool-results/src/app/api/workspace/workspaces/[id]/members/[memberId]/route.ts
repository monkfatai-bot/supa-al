/**
 * Supa AI — Phase 9 single-member route.
 *
 * PATCH  `/api/workspace/workspaces/:id/members/:memberId` — update role/status.
 * DELETE `/api/workspace/workspaces/:id/members/:memberId` — remove member.
 *
 * @module @/app/api/workspace/workspaces/[id]/members/[memberId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createMemberService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateMemberSchema } from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string; memberId: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id, memberId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!memberId) throw new NotFoundError("Workspace member");

    const input = validateInput(updateMemberSchema, await req.json());

    const service = await createMemberService();
    const member = await service.update(id, user.id, memberId, input);
    return apiSuccess({ member });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id, memberId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!memberId) throw new NotFoundError("Workspace member");

    const service = await createMemberService();
    await service.remove(id, user.id, memberId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
