/**
 * Supa AI — Phase 10 single-invoice route.
 *
 * Adds `POST /:id/mark-paid` via the body's `markPaid: true` flag (kept
 * as a PATCH-shape so the route stays RESTful). The dedicated
 * mark-paid mutation lives in {@link InvoiceService.markPaid}.
 *
 * @module @/app/api/business/invoices/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createInvoiceService } from "@/lib/business";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateInvoiceSchema } from "@/lib/validation/business";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function workspaceIdFrom(req: NextRequest): string {
  return new URL(req.url).searchParams.get("workspaceId") ?? "";
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Invoice");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createInvoiceService();
    const invoice = await service.get(workspaceId, user.id, id);
    return apiSuccess({ invoice });
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
    if (!id) throw new NotFoundError("Invoice");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const body = (await req.json()) as Record<string, unknown>;
    // Special-case: `markPaid: true` flips the invoice to paid + stamps
    // `paid_at`. The body shape `{ markPaid: true }` is intentionally
    // narrow so it never collides with a real update payload.
    if (body.markPaid === true) {
      const service = await createInvoiceService();
      const invoice = await service.markPaid(
        workspaceId,
        user.id,
        id,
        typeof body.paidAt === "string" ? body.paidAt : undefined,
      );
      return apiSuccess({ invoice });
    }

    const input = validateInput(updateInvoiceSchema, body);
    const service = await createInvoiceService();
    const invoice = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ invoice });
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
    if (!id) throw new NotFoundError("Invoice");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createInvoiceService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
