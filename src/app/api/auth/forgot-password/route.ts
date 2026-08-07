/**
 * Supa AI — Forgot-password route.
 *
 * POST `/api/auth/forgot-password` — requests a password-reset email from
 * Supabase. Rate-limited (AUTH preset, keyed by IP).
 *
 * **Privacy contract**: this route ALWAYS returns `{success: true}` regardless
 * of whether the email maps to a real account. This prevents account
 * enumeration via the reset flow.
 *
 * Response envelope (always):
 * ```json
 * { "success": true, "data": { "requested": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { getClientIp } from "@/lib/auth/helpers";
import { validateInput } from "@/lib/validation";
import { passwordResetSchema } from "@/lib/validation/auth";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Rate limit (AUTH preset, keyed by IP).
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    // Validate input shape (email format). A malformed email is the only
    // error we surface — never reveal whether the email exists.
    const input = validateInput(passwordResetSchema, await req.json());

    const authService = await createAuthService();
    await authService.requestPasswordReset(input.email);

    return apiSuccess({ requested: true });
  } catch (err) {
    return apiError(err);
  }
}
