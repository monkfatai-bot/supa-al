/**
 * Supa AI — Image usage stats route.
 *
 * GET `/api/images/usage`
 *
 * Returns the caller's aggregated image usage for an optional date
 * range. Accepts `from` + `to` query params (ISO dates or full
 * timestamps).
 *
 * @module @/app/api/images/usage/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getImageUsage } from "@/lib/image";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;

    const stats = await getImageUsage(user.id, { from, to });

    return apiSuccess({ usage: stats });
  } catch (err) {
    return apiError(err);
  }
}
