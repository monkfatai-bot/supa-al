/**
 * Supa AI — Phase 10 Integration Hub — connect with API key.
 *
 * POST `/api/v1/integrations/connect/[id]` — connect an integration with an API key.
 *
 * @module @/app/api/v1/integrations/connect/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { connectWithApiKeySchema } from "@/lib/validation/integrations";
import { parseJsonBody } from "../../_helpers";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    const body = await parseJsonBody(req);
    const input = validateInput(connectWithApiKeySchema, body);
    const service = getIntegrationService();
    const integration = await service.connectWithApiKey({
      integrationId: id,
      userId: user.id,
      data: input,
    });
    return apiSuccess({ integration });
  } catch (err) {
    return apiError(err);
  }
}
