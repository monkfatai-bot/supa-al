/**
 * Supa AI — Prompt template favorite-toggle route.
 *
 * POST `/api/chat/templates/:id/favorite`  — toggle the `is_favorite` flag
 *   on a user-owned template. Body: `{ "favorite": boolean }`. Built-in
 *   (public) templates cannot be favorited through this path — the service
 *   surfaces a {@link ValidationError} (400) with a friendly message
 *   instructing the caller to copy the template first.
 *
 * Requires an authenticated session + ownership of the template.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { ...PromptTemplate } }
 * ```
 *
 * @module @/app/api/chat/templates/[id]/favorite/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createPromptTemplateService } from "@/lib/chat/prompt-template-service";
import { validateInput } from "@/lib/validation";

const favoriteBodySchema = z.object({
  favorite: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    const input = validateInput(favoriteBodySchema, await req.json());

    const service = await createPromptTemplateService();
    const template = await service.toggleFavorite(user.id, id, input.favorite);

    return apiSuccess(template);
  } catch (err) {
    return apiError(err);
  }
}
