/**
 * Supa AI — Phase 9C marketplace rate route.
 *
 * POST `/api/employees/marketplace/:id/rate` — record a rating
 * (1..5) for a marketplace entry. Recomputes the rolling `rating`
 * and `review_count`. Ratings are stored in the marketplace row's
 * `metadata.ratings` array (Phase 9C V1 — a dedicated
 * `marketplace_ratings` table lands in a later phase).
 *
 * @module @/app/api/employees/marketplace/[id]/rate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { rateEmployeeSchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Marketplace entry");

    const input = validateInput(rateEmployeeSchema, await req.json());

    const service = createEmployeeService();
    const entry = await service.rateEmployee(id, input.rating);
    return apiSuccess({ entry });
  } catch (err) {
    return apiError(err);
  }
}
