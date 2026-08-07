/**
 * Supa AI — Phase 9 file upload route.
 *
 * POST `/api/workspace/files` — multipart upload. Accepts a single file
 *     part (`file`) plus optional JSON `metadata` (fileName, mimeType,
 *     folderId) fields. Stores the blob in the `workspace-files` bucket
 *     and records it in `file_library`.
 *
 * @module @/app/api/workspace/files/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFileService } from "@/lib/workspace";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  MAX_FILE_UPLOAD_BYTES,
  uploadFileSchema,
} from "@/lib/validation/workspace";
import { validateInput } from "@/lib/validation";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const form = await req.formData().catch(() => null);
    if (!form) {
      throw new ValidationError("Request must be multipart/form-data.");
    }

    const workspaceId = String(form.get("workspaceId") ?? "");
    if (!workspaceId) throw new NotFoundError("Workspace");

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      throw new ValidationError("`file` is required and must be a Blob/File.");
    }
    if (file.size > MAX_FILE_UPLOAD_BYTES) {
      throw new ValidationError(
        `File is too large (max ${MAX_FILE_UPLOAD_BYTES} bytes / 25 MB).`,
      );
    }

    const metadata = validateInput(uploadFileSchema, {
      fileName: String(form.get("fileName") ?? file.name),
      mimeType: form.get("mimeType") ? String(form.get("mimeType")) : (file.type || null),
      folderId: form.get("folderId") ? String(form.get("folderId")) : null,
    });

    const service = await createFileService();
    const uploaded = await service.upload(workspaceId, user.id, {
      fileName: metadata.fileName,
      fileContent: await file.arrayBuffer(),
      mimeType: metadata.mimeType,
      folderId: metadata.folderId,
    });
    return apiSuccess(uploaded);
  } catch (err) {
    return apiError(err);
  }
}
