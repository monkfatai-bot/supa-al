/**
 * Supa AI — Phase 10 Integration Hub — OAuth callback.
 *
 * GET `/api/v1/integrations/oauth/callback?code=...&state=...`
 *
 * Public — the OAuth2 provider redirects here with the `code` + `state`.
 *
 * @module @/app/api/v1/integrations/oauth/callback/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getOAuthManager } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import { oauthCallbackQuerySchema } from "@/lib/validation/integrations";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const query = validateInput(oauthCallbackQuerySchema, {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    });
    const mgr = getOAuthManager();
    const result = await mgr.handleCallback(query);
    return apiSuccess({ result });
  } catch (err) {
    return apiError(err);
  }
}
