/**
 * Supa AI — Chat files list + upload route.
 *
 * GET  `/api/chat/files`   — list the caller's uploaded files. Optional
 *                            query params: `conversationId`, `limit`
 *                            (1–200, default 50).
 * POST `/api/chat/files`   — upload a new file. Accepts `multipart/form-data`
 *                            with a single `file` field. Validates with
 *                            {@link validateChatFile}, uploads to the
 *                            `uploads` bucket via {@link StorageService},
 *                            inserts a `files` row.
 *
 * Both handlers require an authenticated session.
 *
 * Response envelope (success, list):
 * ```json
 * { "success": true, "data": [ ...UploadedFile ] }
 * ```
 *
 * Response envelope (success, upload):
 * ```json
 * { "success": true, "data": { ...UploadedFile } }
 * ```
 *
 * @module @/app/api/chat/files/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFileContextService } from "@/lib/chat/file-context-service";
import { ValidationError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";

const listFilesQuerySchema = z.object({
  conversationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const url = new URL(req.url);
    const rawQuery: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      rawQuery[key] = value;
    }
    const opts = validateInput(listFilesQuerySchema, rawQuery);

    const service = await createFileContextService();
    const files = await service.listFiles(user.id, {
      conversationId: opts.conversationId,
      limit: opts.limit,
    });

    return apiSuccess(files);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    // Parse multipart/form-data. The `file` field is required.
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ValidationError(
        "Request body must be multipart/form-data with a `file` field.",
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError(
        "Missing `file` field in multipart form data. Expected a single File.",
      );
    }
    if (file.size === 0) {
      throw new ValidationError("Uploaded file is empty.");
    }

    const service = await createFileContextService();
    const uploaded = await service.uploadFile(user.id, file);

    return apiSuccess(uploaded);
  } catch (err) {
    return apiError(err);
  }
}
