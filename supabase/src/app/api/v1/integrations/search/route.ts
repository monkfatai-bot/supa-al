/**
 * Supa AI — Phase 10 Integration Hub — search marketplace apps.
 *
 * GET `/api/v1/integrations/search?q=...`
 *
 * @module @/app/api/v1/integrations/search/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { searchSchema } from "@/lib/validation/integrations";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const input = validateInput(searchSchema, {
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    const service = getMarketplaceService();
    const apps = await service.listApps({
      search: input.q,
      limit: input.limit,
    });
    return apiSuccess({ apps });
  } catch (err) {
    return apiError(err);
  }
}
