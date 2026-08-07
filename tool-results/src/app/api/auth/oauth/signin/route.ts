/**
 * Supa AI — OAuth sign-in URL route.
 *
 * POST `/api/auth/oauth/signin` — returns the OAuth authorization URL for
 * the requested provider. The client navigates the browser to this URL,
 * which kicks off the PKCE OAuth flow. Supabase redirects back to
 * `/api/auth/callback?code=...` after the user authenticates with the
 * provider.
 *
 * Body: `{ provider: 'google' | 'github' | 'microsoft' | 'apple', redirectTo?: string }`
 *
 * The `redirectTo` query (when present) is the path the user should land on
 * after a successful callback. It MUST be a same-origin relative path; an
 * absolute URL or `//`-prefixed value is rejected.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "url": "https://accounts.google.com/..." } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";
import { oauthProviderSchema } from "@/lib/validation/auth";

const oauthSigninSchema = z.object({
  provider: oauthProviderSchema,
  redirectTo: z
    .string()
    .trim()
    .refine(
      (v) => !v || (v.startsWith("/") && !v.startsWith("//")),
      "redirectTo must be a relative path (e.g. /dashboard).",
    )
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const input = validateInput(oauthSigninSchema, await req.json());
    const authService = await createAuthService();
    const url = await authService.getOAuthSignInUrl(input.provider, input.redirectTo);
    return apiSuccess({ url });
  } catch (err) {
    return apiError(err);
  }
}
