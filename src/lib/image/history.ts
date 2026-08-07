/**
 * Supa AI — Phase 4 Image generation history (server-only).
 *
 * Wraps `ImageService.list` with a friendlier shape (pagination
 * metadata, cursor-style `hasMore`). Used by the `/api/images/history`
 * route and the dashboard gallery.
 *
 * @module @/lib/image/history
 */
import "server-only";

import { getImageService } from "./image-service";
import type { ImageGeneration, ListImagesQuery } from "./types";

/** Result of `listImageHistory`. */
export interface ImageHistoryResult {
  generations: ImageGeneration[];
  hasMore: boolean;
}

/** Default page size. */
const DEFAULT_PAGE_SIZE = 24;

/**
 * List the caller's image-generation history with optional filters +
 * pagination. The returned `hasMore` flag is computed from the page
 * size + offset so the UI can render a "Load more" affordance.
 */
export async function listImageHistory(
  userId: string,
  query: ListImagesQuery = {},
): Promise<ImageHistoryResult> {
  const service = getImageService();
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_PAGE_SIZE, 100));
  // Fetch one extra so we can detect "hasMore" without an extra count query.
  const generations = await service.list(userId, {
    ...query,
    limit: limit + 1,
    offset: query.offset ?? 0,
  });
  const hasMore = generations.length > limit;
  if (hasMore) generations.pop();
  return { generations, hasMore };
}
