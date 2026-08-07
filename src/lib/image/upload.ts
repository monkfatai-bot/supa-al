/**
 * Supa AI — Phase 4 Image upload helpers (server-only).
 *
 * Wraps `ImageService.upload` for the `/api/images/upload` route. The
 * route handler parses the multipart form data + validates MIME + size
 * before handing off to this helper.
 *
 * @module @/lib/image/upload
 */
import "server-only";

import { getImageService } from "./image-service";
import type { UploadImageInput, UploadImageResult } from "./types";

/** Upload a user image (used by the editor workflows). */
export async function uploadImage(
  userId: string,
  input: UploadImageInput,
): Promise<UploadImageResult> {
  const service = getImageService();
  // `ImageService.upload` requires an ArrayBuffer / ArrayBufferView; we
  // convert the Blob here so callers don't need to.
  let body: ArrayBuffer | ArrayBufferView;
  if (input.body instanceof Blob) {
    body = await input.body.arrayBuffer();
  } else {
    body = input.body;
  }
  return service.upload(userId, { ...input, body });
}
