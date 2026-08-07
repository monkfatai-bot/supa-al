/**
 * Supa AI — Phase 9C single-employee route.
 *
 * GET    `/api/employees/:id`  — fetch a single employee + relations.
 * PATCH  `/api/employees/:id`  — partial update (name, role, status,
 *                                system_prompt, permissions, etc.).
 * DELETE `/api/employees/:id`  — hard-delete (cascades to skills,
 *                                memory, training, versions).
 *
 * @module @/app/api/employees/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateEmployeeSchema } from "@/lib/validation/employees";

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
    const employee = await service.get(id);
    if (!employee) throw new NotFoundError("Employee", id);

    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const input = validateInput(updateEmployeeSchema, await req.json());

    const service = createEmployeeService();
    const employee = await service.update(id, input);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const service = createEmployeeService();
    await service.delete(id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
