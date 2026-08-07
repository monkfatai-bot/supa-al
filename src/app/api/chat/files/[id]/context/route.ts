/**
 * Supa AI — Chat file context-extraction route.
 *
 * GET `/api/chat/files/:id/context`  — extract text content from an
 *   uploaded file for AI context. Behavior by type:
 *     - text, markdown, json, csv → `extracted: true`, full content.
 *     - pdf                       → `extracted: true` when text streams
 *                                   are recoverable; `extracted: false`
 *                                   with a metadata note otherwise.
 *     - docx, xlsx                → `extracted: false`, metadata note.
 *     - unknown                   → `extracted: false`, metadata note.
 *
 *   Response envelope (success):
 *   ```json
 *   {
 *     "success": true,
 *     "data": {
 *       "content": "<extracted text or metadata note>",
 *       "extracted": true,
 *       "filename": "notes.txt",
 *       "mimeType": "text/plain",
 *       "mimeTypeLabel": "Text File",
 *       "sizeBytes": 1234
 *     }
 *   }
 *   ```
 *
 * Requires an authenticated session + ownership of the file. The route
 * always returns 200 — extraction is best-effort and the AI should know
 * the file exists even when we can't show it the content.
 *
 * @module @/app/api/chat/files/[id]/context/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createFileContextService } from "@/lib/chat/file-context-service";
import {
  getFileTypeLabel,
  inferMimeTypeFromName,
} from "@/lib/chat/file-validation";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Pattern that matches the metadata-note signature emitted by
 * {@link FileContextService.extractContext} when extraction was unavailable.
 *
 * The service emits notes shaped like:
 *   `[PDF file: report.pdf, 102400 bytes — content extraction not available]`
 *   `[DOCX file: doc.docx, 5120 bytes — content extraction requires a DOCX parser]`
 *   `[application/pdf file: report.pdf, 102400 bytes — content extraction not available]`
 *
 * The opening `[` + an uppercase letter or known MIME prefix, ending with
 * `content extraction` somewhere in the string and a closing `]`. We keep
 * the test deliberately loose on the prefix to avoid false negatives when
 * the service adds new MIME types, but require both `content extraction`
 * and a trailing `]` to avoid false positives on user content.
 */
const METADATA_NOTE_PATTERN =
  /^\[[^\]\n]*\bcontent extraction\b[^\]\n]*\]$/;

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

    const content = await service.extractContext(file);
    const mimeType = file.mime_type ?? inferMimeTypeFromName(file.filename ?? "");

    // Extraction succeeded iff the returned content is NOT a metadata note.
    const extracted = !METADATA_NOTE_PATTERN.test(content);

    return apiSuccess({
      content,
      extracted,
      filename: file.filename,
      mimeType,
      mimeTypeLabel: getFileTypeLabel(mimeType),
      sizeBytes: file.size_bytes,
    });
  } catch (err) {
    return apiError(err);
  }
}
