/**
 * Supa AI — Video model catalog route.
 *
 * GET `/api/video/models`
 *
 * Returns the catalog grouped by provider. Merges the persisted
 * `video_models` rows with each provider's static catalog (via
 * {@link VideoCatalogService.list}) so the UI can render the picker
 * even before an admin wires up catalog rows.
 *
 * @module @/app/api/video/models/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoCatalogService } from "@/lib/video";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();

    const service = createVideoCatalogService();
    const groups = await service.list();

    return apiSuccess({
      groups,
      availableProviders: groups
        .filter((g) => g.models.some((m) => m.isActive))
        .map((g) => g.provider),
    });
  } catch (err) {
    return apiError(err);
  }
}
