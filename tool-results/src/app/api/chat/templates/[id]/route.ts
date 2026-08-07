/**
 * Supa AI — Prompt template get / update / delete route.
 *
 * GET    `/api/chat/templates/:id`  — fetch a single template. Returns 404
 *                                     if the caller can't see it (owner OR
 *                                     public — RLS hides everything else).
 * PATCH  `/api/chat/templates/:id`  — partial-update a template owned by
 *                                     the caller. Non-owners get 404 (we
 *                                     don't leak existence).
 * DELETE `/api/chat/templates/:id`  — permanently delete a template owned
 *                                     by the caller. Idempotent.
 *
 * All three handlers require an authenticated session.
 *
 * @module @/app/api/chat/templates/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createPromptTemplateService } from "@/lib/chat/prompt-template-service";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updatePromptTemplateSchema } from "@/lib/validation/chat";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;

    const service = await createPromptTemplateService();
    const template = await service.get(user.id, id);
    if (!template) {
      throw new NotFoundError("Prompt template", id);
    }

    return apiSuccess(template);
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
    const input = validateInput(updatePromptTemplateSchema, await req.json());

    const service = await createPromptTemplateService();
    const template = await service.update(user.id, id, input);

    return apiSuccess(template);
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;

    const service = await createPromptTemplateService();
    await service.delete(user.id, id);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
