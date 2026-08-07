/**
 * Supa AI — Phase 10 Integration Hub — integrations list + create route.
 *
 * GET  `/api/v1/integrations?workspaceId=...` — paginated list.
 * POST `/api/v1/integrations`                  — create a new integration.
 *
 * @module @/app/api/v1/integrations/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import {
  createIntegrationSchema,
  listIntegrationsQuerySchema,
} from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "./_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const query = validateInput(listIntegrationsQuerySchema, {
      status: url.searchParams.get("status") ?? undefined,
      connectorKey: url.searchParams.get("connectorKey") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
      offset: url.searchParams.get("offset")
        ? Number(url.searchParams.get("offset"))
        : undefined,
    });

    const service = getIntegrationService();
    const integrations = await service.list({ workspaceId, ...query });
    return apiSuccess({ integrations });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(createIntegrationSchema, body);

    const service = getIntegrationService();
    const integration = await service.create({ workspaceId, userId: user.id, data: input });
    return apiSuccess({ integration });
  } catch (err) {
    return apiError(err);
  }
}
