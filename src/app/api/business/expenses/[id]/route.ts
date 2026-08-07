/**
 * Supa AI — Phase 10 single-expense route.
 *
 * Supports `approve: true` / `reject: true` shortcuts in the PATCH body
 * so the UI can move an expense through its approval workflow without
 * a dedicated route.
 *
 * @module @/app/api/business/expenses/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createExpenseService } from "@/lib/business";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateExpenseSchema } from "@/lib/validation/business";

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
    if (!id) throw new NotFoundError("Expense");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const service = await createExpenseService();
    const expense = await service.get(workspaceId, user.id, id);
    return apiSuccess({ expense });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Expense");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const body = (await req.json()) as Record<string, unknown>;
    if (body.approve === true) {
      const service = await createExpenseService();
      const expense = await service.approve(workspaceId, user.id, id);
      return apiSuccess({ expense });
    }
    if (body.reject === true) {
      const service = await createExpenseService();
      const expense = await service.reject(workspaceId, user.id, id);
      return apiSuccess({ expense });
    }

    const input = validateInput(updateExpenseSchema, body);
    const service = await createExpenseService();
    const expense = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ expense });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Expense");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const service = await createExpenseService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
