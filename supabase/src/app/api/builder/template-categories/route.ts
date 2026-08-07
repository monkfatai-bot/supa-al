/**
 * Supa AI — Phase 9B Builder — template categories.
 *
 * GET `/api/builder/template-categories`
 *      — list active categories for the public marketplace picker.
 *
 * Public read (RLS allows `is_active = true` for any caller); auth is
 * still required so anonymous bots can't hammer the endpoint.
 *
 * @module @/app/api/builder/template-categories/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";

export async function GET(
  _req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const service = await createBuilderService();
    const categories = await service.listTemplateCategories();
    return apiSuccess({ categories });
  } catch (err) {
    return apiError(err);
  }
}
