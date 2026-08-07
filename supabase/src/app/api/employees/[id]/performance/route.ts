/**
 * Supa AI — Phase 9C employee performance route.
 *
 * GET `/api/employees/:id/performance?dateFrom=&dateTo=` — fetch
 *   performance rows for an employee, optionally filtered by date
 *   range. Returns rows in chronological order (oldest first) so the
 *   UI can plot a trend.
 *
 * @module @/app/api/employees/[id]/performance/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { performanceQuerySchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const url = new URL(req.url);
    const query = validateInput(performanceQuerySchema, {
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
    });

    const service = createEmployeeService();
    const performance = await service.getPerformance(id, query);
    return apiSuccess({ performance });
  } catch (err) {
    return apiError(err);
  }
}
