/**
 * Supa AI — Voice usage route.
 *
 * GET `/api/voice/usage`
 *
 * Optional query params: `from`, `to` (ISO date strings). Defaults to
 * the current calendar month.
 *
 * Returns the caller's voice usage summary (generations + credits +
 * byType + byProvider) for the requested period.
 *
 * @module @/app/api/voice/usage/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createUsageService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { usageQuerySchema } from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const opts = validateInput(usageQuerySchema, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });

    // Default to current calendar month.
    const now = new Date();
    const start = opts.from ? new Date(opts.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = opts.to ? new Date(opts.to) : now;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid `from` or `to` query parameter — expected an ISO date string.");
    }

    const workspaceId = user.id;
    const service = createUsageService();
    const summary = await service.getSummary(workspaceId, { start, end });
    return apiSuccess(summary);
  } catch (err) {
    return apiError(err);
  }
}
