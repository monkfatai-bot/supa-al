/**
 * Supa AI — Phase 9C employee versions list + create route.
 *
 * GET  `/api/employees/:id/versions` — list version snapshots
 *                                      (newest-first).
 * POST `/api/employees/:id/versions` — snapshot the current employee
 *                                      config into a new version.
 *
 * @module @/app/api/employees/[id]/versions/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { createVersionSchema } from "@/lib/validation/employees";

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
    const versions = await service.listVersions(id);
    return apiSuccess({ versions });
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = validateInput(createVersionSchema, body);

    const service = createEmployeeService();
    const version = await service.createVersion(id, user.id, input);
    return apiSuccess({ version });
  } catch (err) {
    return apiError(err);
  }
}
