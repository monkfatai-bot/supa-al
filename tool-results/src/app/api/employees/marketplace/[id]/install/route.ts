/**
 * Supa AI — Phase 9C marketplace install route.
 *
 * POST `/api/employees/marketplace/:id/install` — install a
 * marketplace employee into the caller's workspace. Clones the source
 * employee (with skills + system_prompt) and bumps the marketplace
 * entry's `install_count`.
 *
 * @module @/app/api/employees/marketplace/[id]/install/route
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
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Marketplace entry");

    const service = createEmployeeService();
    const employee = await service.installFromMarketplace(id, user.id, user.id);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}
