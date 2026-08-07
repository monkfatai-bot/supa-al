/**
 * Supa AI — Chat usage route.
 *
 * GET `/api/chat/usage`
 *
 * Returns the caller's usage summary (tokens + cost + request count) for
 * the current calendar month. Used by the dashboard's usage card.
 *
 * Requires a valid session.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "totalTokens": 12345,
 *     "totalCostCents": 12,
 *     "requestCount": 8,
 *     "period": { "start": "2024-01-01T00:00:00.000Z", "end": "2024-01-31T..." }
 *   }
 * }
 * ```
 *
 * @module @/app/api/chat/usage/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCreditsService } from "@/lib/chat";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    // Current calendar month: start = first day at 00:00:00, end = now.
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const creditsService = createCreditsService();
    const summary = await creditsService.getUsageSummary(user.id, {
      start,
      end: now,
    });

    return apiSuccess({
      ...summary,
      period: { start: start.toISOString(), end: now.toISOString() },
    });
  } catch (err) {
    return apiError(err);
  }
}
