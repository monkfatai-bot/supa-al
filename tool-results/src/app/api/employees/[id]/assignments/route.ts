/**
 * Supa AI — Phase 9C employee assignments list + create route.
 *
 * GET  `/api/employees/:id/assignments`  — list workspaces the
 *                                         employee is assigned to.
 * POST `/api/employees/:id/assignments`  — assign the employee to a
 *                                         workspace. Idempotent.
 *
 * @module @/app/api/employees/[id]/assignments/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { assignToWorkspaceSchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const service = createEmployeeService();
    const assignments = await service.listAssignments(id);
    return apiSuccess({ assignments });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const input = validateInput(assignToWorkspaceSchema, await req.json());

    const service = createEmployeeService();
    const assignment = await service.assignToWorkspace(
      id,
      input.workspaceId,
      user.id,
      input.roleOverride ?? undefined,
    );
    return apiSuccess({ assignment });
  } catch (err) {
    return apiError(err);
  }
}
