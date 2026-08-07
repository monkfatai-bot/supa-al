/**
 * Supa AI — Phase 10 Integration Hub — marketplace list + create route.
 *
 * GET  `/api/v1/integrations/marketplace`  — browse published apps.
 * POST `/api/v1/integrations/marketplace`  — publish a new app (publisher-only).
 *
 * @module @/app/api/v1/integrations/marketplace/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getMarketplaceService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import {
  listAppsQuerySchema,
  publishAppSchema,
} from "@/lib/validation/integrations";
import { parseJsonBody } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listAppsQuerySchema, {
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      isFeatured: url.searchParams.get("isFeatured") === "true" ? true : undefined,
      isOfficial: url.searchParams.get("isOfficial") === "true" ? true : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = getMarketplaceService();
    const apps = await service.listApps(query);
    return apiSuccess({ apps });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = await parseJsonBody(req);
    const input = validateInput(publishAppSchema, body);

    const service = getMarketplaceService();
    const app = await service.publishApp({ userId: user.id, data: input });
    return apiSuccess({ app });
  } catch (err) {
    return apiError(err);
  }
}
