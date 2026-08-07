/**
 * Supa AI — Phase 9 workspace folders route.
 *
 * GET  `/api/workspace/workspaces/:id/folders` — list folders (flat).
 * POST `/api/workspace/workspaces/:id/folders` — create a folder.
 *
 * @module @/app/api/workspace/workspaces/[id]/folders/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFolderService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { createFolderSchema } from "@/lib/validation/workspace";

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

    const service = await createFolderService();
    const folders = await service.list(id, user.id);
    return apiSuccess({ folders });
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

    const input = validateInput(createFolderSchema, await req.json());

    const service = await createFolderService();
    const folder = await service.create(id, user.id, input);
    return apiSuccess({ folder });
  } catch (err) {
    return apiError(err);
  }
}
