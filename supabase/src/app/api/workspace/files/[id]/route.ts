/**
 * Supa AI — Phase 9 single-file route.
 *
 * GET    `/api/workspace/files/:id?workspaceId=...` — get file row + signed URL.
 * DELETE `/api/workspace/files/:id?workspaceId=...` — delete file.
 *
 * @module @/app/api/workspace/files/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFileService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("File");

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw new NotFoundError("Workspace");

    const service = await createFileService();
    const file = await service.getWithUrl(workspaceId, user.id, id);
    return apiSuccess(file);
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
    if (!id) throw new NotFoundError("File");

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw new NotFoundError("Workspace");

    const service = await createFileService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
