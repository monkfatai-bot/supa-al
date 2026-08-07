/**
 * Supa AI — Phase 9 single-document route.
 *
 * GET    `/api/workspace/workspaces/:id/documents/:docId`  — fetch one.
 * PATCH  `/api/workspace/workspaces/:id/documents/:docId`  — partial update.
 * DELETE `/api/workspace/workspaces/:id/documents/:docId`  — hard-delete.
 *
 * @module @/app/api/workspace/workspaces/[id]/documents/[docId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createDocumentService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateDocumentSchema } from "@/lib/validation/workspace";

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id, docId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!docId) throw new NotFoundError("Document");

    const service = await createDocumentService();
    const document = await service.get(id, user.id, docId);
    return apiSuccess({ document });
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
    const { id, docId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!docId) throw new NotFoundError("Document");

    const input = validateInput(updateDocumentSchema, await req.json());

    const service = await createDocumentService();
    const document = await service.update(id, user.id, docId, input);
    return apiSuccess({ document });
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
    const { id, docId } = await ctx.params;
    if (!id) throw new NotFoundError("Workspace");
    if (!docId) throw new NotFoundError("Document");

    const service = await createDocumentService();
    await service.delete(id, user.id, docId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
