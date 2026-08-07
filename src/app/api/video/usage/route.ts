/**
 * Supa AI — Video usage route.
 *
 * GET `/api/video/usage`
 *
 * Returns the caller's video usage summary for the current calendar
 * month: total videos generated, total credits consumed, and a
 * per-provider breakdown.
 *
 * @module @/app/api/video/usage/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoUsageService } from "@/lib/video";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const service = createVideoUsageService();
    const summary = await service.getMonthlySummary(user.id);

    return apiSuccess(summary);
  } catch (err) {
    return apiError(err);
  }
}
