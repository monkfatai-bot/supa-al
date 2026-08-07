/**
 * Supa AI — Sign-in route.
 *
 * POST `/api/auth/signin` — authenticates a user with email + password.
 *
 * Security chain:
 *   1. Rate-limited (AUTH preset, keyed by IP).
 *   2. Brute-force pre-check (locked identities are rejected with a 429 +
 *      `Retry-After` header before any credential check).
 *   3. AuthService attempts Supabase `signInWithPassword`.
 *   4. On failure: the brute-force counter is bumped; if the threshold is
 *      crossed, a 429 is returned instead of the underlying 401.
 *   5. On success: the counter is cleared + the user is returned.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "user": {...} } }
 * ```
 *
 * Response envelope (locked):
 * ```json
 * { "success": false, "error": { "code": "RATE_LIMIT_ERROR", "message": "..." } }
 * ```
 * with `Retry-After: <seconds>` header.
 *
 * The error message for invalid credentials is intentionally generic
 * ("Invalid email or password.") so attackers cannot enumerate which of
 * email/password is wrong.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import {
  bruteForceKey,
  checkBruteForce,
} from "@/lib/auth/brute-force";
import { getClientIp } from "@/lib/auth/helpers";
import { RateLimitError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { signInSchema } from "@/lib/validation/auth";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Rate limit (AUTH preset, keyed by IP).
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    // 2. Validate input first so we have a clean email to key the brute-force
    //    counter on.
    const input = validateInput(signInSchema, await req.json());

    // 3. Brute-force pre-check.
    const userAgent = req.headers.get("user-agent");
    const bfKey = bruteForceKey(ip, input.email);
    const bfState = await checkBruteForce(bfKey);
    if (bfState.locked) {
      // Defer to apiError so the Retry-After header is set from the
      // RateLimitError's `retryAfter` detail.
      throw new RateLimitError(
        "Too many failed sign-in attempts. Please try again later.",
        bfState.retryAfter,
        { attempts: bfState.attempts },
      );
    }

    // 4. Attempt sign-in.
    const authService = await createAuthService();
    const result = await authService.signInWithEmail(
      {
        email: input.email,
        password: input.password,
        rememberMe: input.rememberMe,
      },
      { ip, userAgent, bfKey },
    );

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
