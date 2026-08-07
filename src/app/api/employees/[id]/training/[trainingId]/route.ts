/**
 * Supa AI — Phase 9C single-training route.
 *
 * DELETE `/api/employees/:id/training/:trainingId` — remove a
 *   training source. Idempotent.
 *
 * (A POST is not exposed at this path — reindexing is exposed via the
 * service layer and can be triggered through the dashboard route.)
 *
 * @module @/app/api/employees/[id]/training/[trainingId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; trainingId: string }>;
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, trainingId } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!trainingId) throw new NotFoundError("Employee training");

    const service = createEmployeeService();
    await service.deleteTraining(trainingId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
