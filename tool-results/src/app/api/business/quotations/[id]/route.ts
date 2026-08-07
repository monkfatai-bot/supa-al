/**
 * Supa AI — Phase 10 single-quotation route.
 *
 * @module @/app/api/business/quotations/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createQuotationService } from "@/lib/business";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateQuotationSchema } from "@/lib/validation/business";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function workspaceIdFrom(req: NextRequest): string {
  return new URL(req.url).searchParams.get("workspaceId") ?? "";
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Quotation");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const service = await createQuotationService();
    const quotation = await service.get(workspaceId, user.id, id);
    return apiSuccess({ quotation });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Quotation");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const input = validateInput(updateQuotationSchema, await req.json());
    const service = await createQuotationService();
    const quotation = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ quotation });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Quotation");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const service = await createQuotationService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
