/**
 * Supa AI — Phase 10 Integration Hub — marketplace app versions.
 *
 * GET  `/api/v1/integrations/marketplace/[slug]/versions`         — list versions.
 * POST `/api/v1/integrations/marketplace/[slug]/versions`         — publish a new version.
 *
 * @module @/app/api/v1/integrations/marketplace/[slug]/versions/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { publishVersionSchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../../../_helpers";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { slug } = await ctx.params;
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    const versions = await service.listVersions(app.id);
    return apiSuccess({ versions });
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
    const input = validateInput(publishVersionSchema, body);
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    if (app.publisher_id !== user.id) {
      return apiError(new Error("Only the publisher can publish versions."), 403);
    }
    const version = await service.publishVersion({
      appId: app.id,
      userId: user.id,
      data: input,
    });
    return apiSuccess({ version });
  } catch (err) {
    return apiError(err);
  }
}
