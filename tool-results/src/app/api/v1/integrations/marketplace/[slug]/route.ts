/**
 * Supa AI — Phase 10 Integration Hub — marketplace app detail by slug.
 *
 * GET    `/api/v1/integrations/marketplace/[slug]` — fetch published app.
 * PATCH  `/api/v1/integrations/marketplace/[slug]` — publisher-only update.
 * DELETE `/api/v1/integrations/marketplace/[slug]` — publisher-only delete.
 *
 * @module @/app/api/v1/integrations/marketplace/[slug]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { updateAppSchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../../_helpers";

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
    return apiSuccess({ app });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;
    const body = await parseJsonBody(req);
    const input = validateInput(updateAppSchema, body);
    const service = getMarketplaceService();
    // Look up by slug first, then update by id.
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    if (app.publisher_id !== user.id) {
      return apiError(new Error("Only the publisher can update this app."), 403);
    }
    const updated = await service.updateApp(app.id, input);
    return apiSuccess({ app: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { slug } = await ctx.params;
    const service = getMarketplaceService();
    const app = await service.getAppBySlug(slug);
    if (!app) return apiError(new Error("App not found."), 404);
    if (app.publisher_id !== user.id) {
      return apiError(new Error("Only the publisher can delete this app."), 403);
    }
    await service.deleteApp(app.id);
    return apiSuccess({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
