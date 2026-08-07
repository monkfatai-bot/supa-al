/**
 * Supa AI — Phase 9C single-skill route.
 *
 * PATCH  `/api/employees/:id/skills/:skillId`  — update proficiency /
 *                                              primary flag / config.
 * DELETE `/api/employees/:id/skills/:skillId`  — remove the skill.
 *
 * @module @/app/api/employees/[id]/skills/[skillId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateSkillSchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string; skillId: string }>;
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, skillId } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!skillId) throw new NotFoundError("Employee skill");

    const input = validateInput(updateSkillSchema, await req.json());

    const service = createEmployeeService();
    const skill = await service.updateSkill(skillId, input);
    return apiSuccess({ skill });
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
    const { id, skillId } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");
    if (!skillId) throw new NotFoundError("Employee skill");

    const service = createEmployeeService();
    await service.removeSkill(skillId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
