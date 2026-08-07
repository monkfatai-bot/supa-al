/**
 * Supa AI — Phase 9 document version history route.
 *
 * GET `/api/workspace/workspaces/:id/documents/:docId/versions` — paginated
 *     version history, newest first.
 *
 * @module @/app/api/workspace/workspaces/[id]/documents/[docId]/versions/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVersionService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id, docId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!docId) throw new NotFoundError("Document");

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const offset = url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : undefined;

    const service = await createVersionService();
    const versions = await service.list(id, user.id, docId, limit, offset);
    return apiSuccess({ versions });
  } catch (err) {
    return apiError(err);
  }
}
