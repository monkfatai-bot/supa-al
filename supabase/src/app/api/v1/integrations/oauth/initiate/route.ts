/**
 * Supa AI — Phase 10 Integration Hub — OAuth initiate.
 *
 * POST `/api/v1/integrations/oauth/initiate` — start the OAuth2 flow.
 *
 * @module @/app/api/v1/integrations/oauth/initiate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getOAuthManager } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { oauthInitiateSchema } from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "../../_helpers";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(oauthInitiateSchema, body);

    const mgr = getOAuthManager();
    const result = await mgr.initiate({
      workspaceId,
      userId: user.id,
      connectorKey: input.connectorKey,
      redirectUri: input.redirectUri,
      integrationId: input.integrationId,
      scopes: input.scopes,
    });
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
