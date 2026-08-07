/**
 * Supa AI — Phase 9C single marketplace entry route.
 *
 * GET    `/api/employees/marketplace/:id`   — fetch a single
 *                                             marketplace entry.
 * POST   `/api/employees/marketplace/:id`   — publish (or update) the
 *                                             entry's metadata.
 *
 * @module @/app/api/employees/marketplace/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { publishToMarketplaceSchema } from "@/lib/validation/employees";

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
    if (!id) throw new NotFoundError("Marketplace entry");

    const service = createEmployeeService();
    const entry = await service.getMarketplaceEntry(id);
    if (!entry) throw new NotFoundError("Marketplace entry", id);

    return apiSuccess({ entry });
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
    if (!id) throw new NotFoundError("Marketplace entry");

    const input = validateInput(publishToMarketplaceSchema, await req.json());

    const service = createEmployeeService();
    const entry = await service.publishToMarketplace(id, user.id, input);
    return apiSuccess({ entry });
  } catch (err) {
    return apiError(err);
  }
}
