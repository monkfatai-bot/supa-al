/**
 * Supa AI — Image styles catalog route.
 *
 * GET `/api/images/styles`
 *
 * Returns the curated `image_styles` catalog. The picker uses this to
 * render the style dropdown.
 *
 * @module @/app/api/images/styles/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { listImageStyles } from "@/lib/image";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();

    const styles = await listImageStyles();

    return apiSuccess({ styles });
  } catch (err) {
    return apiError(err);
  }
}
