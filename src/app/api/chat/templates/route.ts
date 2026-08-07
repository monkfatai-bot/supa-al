/**
 * Supa AI — Prompt templates list + create route.
 *
 * GET  `/api/chat/templates`         — list templates visible to the caller
 *                                      (own + public). Optional query
 *                                      params: `category`, `favorites`
 *                                      (1/true), `search`.
 * POST `/api/chat/templates`         — create a new user-owned template.
 *
 * Both handlers require an authenticated session. The list endpoint honors
 * the `prompt_templates_select_owner_or_public` RLS policy (the service
 * adds an explicit `or(user_id.eq.{uid},is_public.eq.true)` filter so the
 * query is also correct under the admin client).
 *
 * Response envelope (success, list):
 * ```json
 * { "success": true, "data": [ ...PromptTemplate ] }
 * ```
 *
 * Response envelope (success, create):
 * ```json
 * { "success": true, "data": { ...PromptTemplate } }
 * ```
 *
 * @module @/app/api/chat/templates/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createPromptTemplateService } from "@/lib/chat/prompt-template-service";
import { validateInput } from "@/lib/validation";
import {
  createPromptTemplateSchema,
  promptTemplateCategorySchema,
} from "@/lib/validation/chat";

/**
 * Query-string schema for the GET handler. All fields are optional.
 * `favorites` is coerced from "1"/"true"/"false"/"0" to a boolean.
 */
const listTemplatesQuerySchema = z.object({
  category: promptTemplateCategorySchema.optional(),
  favorites: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  search: z.string().trim().max(200).optional(),
});

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const url = new URL(req.url);
    const rawQuery: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      rawQuery[key] = value;
    }
    const opts = validateInput(listTemplatesQuerySchema, rawQuery);

    const service = await createPromptTemplateService();
    const templates = await service.list(user.id, {
      category: opts.category,
      favoritesOnly: opts.favorites,
      search: opts.search,
    });

    return apiSuccess(templates);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createPromptTemplateSchema, await req.json());

    const service = await createPromptTemplateService();
    const template = await service.create(user.id, input);

    return apiSuccess(template);
  } catch (err) {
    return apiError(err);
  }
}
