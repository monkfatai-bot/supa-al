/**
 * Supa AI — Phase 9C employee resume route.
 *
 * POST `/api/employees/:id/resume` — set an employee's status to
 * `active`. Idempotent.
 *
 * @module @/app/api/employees/[id]/resume/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const service = createEmployeeService();
    const employee = await service.resume(id);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}
