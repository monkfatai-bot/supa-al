/**
 * Supa AI — Phase 10 Integration Hub — connectors list route.
 *
 * GET `/api/v1/integrations/connectors?category=...&onlyConfigured=...`
 *
 * @module @/app/api/v1/integrations/connectors/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { listConnectorsQuerySchema } from "@/lib/validation/integrations";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listConnectorsQuerySchema, {
      category: url.searchParams.get("category") ?? undefined,
      onlyConfigured:
        url.searchParams.get("onlyConfigured") === "true" ? true : undefined,
    });
    const service = getIntegrationService();
    const connectors = await service.listConnectors(query);
    return apiSuccess({ connectors });
  } catch (err) {
    return apiError(err);
  }
}
