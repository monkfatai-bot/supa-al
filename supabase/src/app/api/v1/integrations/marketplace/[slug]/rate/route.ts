/**
 * Supa AI — Phase 10 Integration Hub — marketplace app rate.
 *
 * POST `/api/v1/integrations/marketplace/[slug]/rate` — rate 1-5.
 *
 * @module @/app/api/v1/integrations/marketplace/[slug]/rate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { rateAppSchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../../../_helpers";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;
    const body = await parseJsonBody(req);
    const input = validateInput(rateAppSchema, body);
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    const rating = await service.rateApp({ appId: app.id, userId: user.id, rating: input.rating });
    return apiSuccess({ rating });
  } catch (err) {
    return apiError(err);
  }
}
