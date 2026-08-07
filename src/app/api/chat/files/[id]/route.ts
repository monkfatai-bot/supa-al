/**
 * Supa AI — Chat file get / delete route.
 *
 * GET    `/api/chat/files/:id`  — fetch a single file's metadata. Returns
 *                                 404 if the caller doesn't own it (RLS
 *                                 hide).
 * DELETE `/api/chat/files/:id`  — permanently delete a file (Storage +
 *                                 DB row + cascaded `message_attachments`).
 *                                 Idempotent.
 *
 * Both handlers require an authenticated session + ownership of the file.
 *
 * Response envelope (success, get):
 * ```json
 * { "success": true, "data": { ...UploadedFile } }
 * ```
 *
 * Response envelope (success, delete):
 * ```json
 * { "success": true, "data": { "deleted": true } }
 * ```
 *
 * @module @/app/api/chat/files/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFileContextService } from "@/lib/chat/file-context-service";
import { NotFoundError } from "@/lib/errors";

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

    const service = await createFileContextService();
    const file = await service.getFile(user.id, id);
    if (!file) {
      throw new NotFoundError("File", id);
    }

    return apiSuccess(file);
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

    const service = await createFileContextService();
    await service.deleteFile(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
