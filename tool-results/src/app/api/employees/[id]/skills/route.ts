/**
 * Supa AI — Phase 9C employee skills list + add route.
 *
 * GET  `/api/employees/:id/skills`  — list skills for an employee.
 * POST `/api/employees/:id/skills`  — add a skill to an employee.
 *
 * @module @/app/api/employees/[id]/skills/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { addSkillSchema } from "@/lib/validation/employees";

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
    const skills = await service.listSkills(id);
    return apiSuccess({ skills });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const input = validateInput(addSkillSchema, await req.json());

    const service = createEmployeeService();
    const skill = await service.addSkill(id, input);
    return apiSuccess({ skill });
  } catch (err) {
    return apiError(err);
  }
}
