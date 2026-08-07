/**
 * Supa AI — Phase 9 workspace members route.
 *
 * GET  `/api/workspace/workspaces/:id/members` — list members.
 * POST `/api/workspace/workspaces/:id/members` — invite a new member.
 *
 * @module @/app/api/workspace/workspaces/[id]/members/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createMemberService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { inviteMemberSchema } from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const service = await createMemberService();
    const members = await service.list(id, user.id);
    return apiSuccess({ members });
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
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const input = validateInput(inviteMemberSchema, await req.json());

    const service = await createMemberService();
    const invitation = await service.invite(id, user.id, input);
    return apiSuccess({ invitation });
  } catch (err) {
    return apiError(err);
  }
}
