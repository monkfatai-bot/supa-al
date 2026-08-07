/**
 * Supa AI — Phase 9C employee clone route.
 *
 * POST `/api/employees/:id/clone` — clone an employee into the same
 * workspace. The clone carries a fresh `id`, `version = 1`, and a
 * `"(clone)"` suffix on the name.
 *
 * @module @/app/api/employees/[id]/clone/route
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
    const employee = await service.clone(id);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}
