/**
 * Supa AI — Sign-up route.
 *
 * POST `/api/auth/signup` — registers a new user with email + password.
 * Rate-limited (AUTH preset, keyed by IP). Returns the new user + a flag
 * indicating whether email verification is required before they can sign in.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "user": {...}, "needsEmailVerification": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { getClientIp } from "@/lib/auth/helpers";
import { validateInput } from "@/lib/validation";
import { signUpSchema } from "@/lib/validation/auth";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit (AUTH preset, keyed by IP).
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    const input = validateInput(signUpSchema, await req.json());
    const authService = await createAuthService();
    const result = await authService.signUpWithEmail({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
