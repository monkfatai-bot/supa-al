/**
 * Supa AI — Phase 10 Integration Hub — marketplace app reviews.
 *
 * GET  `/api/v1/integrations/marketplace/[slug]/reviews` — list reviews.
 * POST `/api/v1/integrations/marketplace/[slug]/reviews` — create + rate.
 *
 * @module @/app/api/v1/integrations/marketplace/[slug]/reviews/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { createReviewSchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../../../_helpers";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { slug } = await ctx.params;
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 20;
    const offset = url.searchParams.get("offset")
      ? Number(url.searchParams.get("offset"))
      : 0;
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    const reviews = await service.listReviews(app.id, limit, offset);
    return apiSuccess({ reviews });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;
    const body = await parseJsonBody(req);
    const input = validateInput(createReviewSchema, body);
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    const review = await service.createReview({
      userId: user.id,
      data: { ...input, appId: app.id },
    });
    return apiSuccess({ review });
  } catch (err) {
    return apiError(err);
  }
}
