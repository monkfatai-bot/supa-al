/**
 * Supa AI — Phase 4 Image usage tracking (server-only).
 *
 * Wraps `ImageService.recordUsage` + `ImageService.getUsageStats` for
 * the `/api/images/usage` route.
 *
 * @module @/lib/image/usage
 */
import "server-only";

import { getImageService } from "./image-service";
import type { ImageProviderId } from "@/lib/ai/image-types";
import type { ImageUsageQuery, ImageUsageStats } from "./types";

/** Aggregate the caller's image usage for an optional date range. */
export async function getImageUsage(
  userId: string,
  query: ImageUsageQuery = {},
): Promise<ImageUsageStats> {
  const service = getImageService();
  return service.getUsageStats(userId, query);
}

/** Record a usage entry (best-effort). Exposed for tests + future webhooks. */
export async function recordImageUsage(
  userId: string,
  workspaceId: string,
  provider: ImageProviderId | string,
  imagesGenerated: number,
  creditsUsed: number,
): Promise<void> {
  const service = getImageService();
  return service.recordUsage(userId, workspaceId, provider, imagesGenerated, creditsUsed);
}
