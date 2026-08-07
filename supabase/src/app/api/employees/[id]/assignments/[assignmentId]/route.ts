/**
 * Supa AI — Phase 9C single-assignment route.
 *
 * DELETE `/api/employees/:id/assignments/:assignmentId` — remove an
 *   assignment (sets `status = 'removed'` rather than hard-delete).
 *
 * @module @/app/api/employees/[id]/assignments/[assignmentId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>;
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, assignmentId } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!assignmentId) throw new NotFoundError("Employee assignment");

    const service = createEmployeeService();
    await service.unassign(assignmentId);
    return apiSuccess({ removed: true });
  } catch (err) {
    return apiError(err);
  }
}
