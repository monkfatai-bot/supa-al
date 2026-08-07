/**
 * Supa AI — Phase 10 single-contact route.
 *
 * GET    `/api/business/contacts/:id?workspaceId=...`
 * PATCH  `/api/business/contacts/:id?workspaceId=...`
 * DELETE `/api/business/contacts/:id?workspaceId=...`
 *
 * @module @/app/api/business/contacts/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createContactService } from "@/lib/business";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateContactSchema } from "@/lib/validation/business";

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
    if (!id) throw new NotFoundError("Contact");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createContactService();
    const contact = await service.get(workspaceId, user.id, id);
    return apiSuccess({ contact });
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
    if (!id) throw new NotFoundError("Contact");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const input = validateInput(updateContactSchema, await req.json());
    const service = await createContactService();
    const contact = await service.update(workspaceId, user.id, id, input);
    return apiSuccess({ contact });
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
    if (!id) throw new NotFoundError("Contact");
    const workspaceId = workspaceIdFrom(req);
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);

    const service = await createContactService();
    await service.delete(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
