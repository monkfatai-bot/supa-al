/**
 * Supa AI — Phase 10 single-customer route.
 *
 * GET    `/api/business/customers/:id?workspaceId=...`  — fetch a customer.
 * PATCH  `/api/business/customers/:id?workspaceId=...`  — partial update.
 * DELETE `/api/business/customers/:id?workspaceId=...`  — hard-delete.
 *
 * @module @/app/api/business/customers/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCustomerService } from "@/lib/business";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateCustomerSchema } from "@/lib/validation/business";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function workspaceIdFrom(req: NextRequest): string {
  const url = new URL(req.url);
  const v = url.searchParams.get("workspaceId") ?? "";
  return v;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Customer");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createCustomerService();
    const customer = await service.get(workspaceId, user.id, id);
    return apiSuccess({ customer });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Customer");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const input = validateInput(updateCustomerSchema, await req.json());
    const service = await createCustomerService();
    const customer = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ customer });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Customer");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createCustomerService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
