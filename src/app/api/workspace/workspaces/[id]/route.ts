/**
 * Supa AI — Phase 9 single-workspace route.
 *
 * GET    `/api/workspace/workspaces/:id`  — fetch a workspace.
 * PATCH  `/api/workspace/workspaces/:id`  — update (admin-only).
 * DELETE `/api/workspace/workspaces/:id`  — hard-delete (owner-only).
 *
 * @module @/app/api/workspace/workspaces/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createWorkspaceService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateWorkspaceSchema } from "@/lib/validation/workspace";

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

    const service = await createWorkspaceService();
    const workspace = await service.get(id, user.id);
    return apiSuccess({ workspace });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const input = validateInput(updateWorkspaceSchema, await req.json());

    const service = await createWorkspaceService();
    const workspace = await service.update(id, user.id, input);
    return apiSuccess({ workspace });
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
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");

    const service = await createWorkspaceService();
    await service.delete(id, user.id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
