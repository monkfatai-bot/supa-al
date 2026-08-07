/**
 * Supa AI — Sign-out route.
 *
 * POST `/api/auth/signout` — destroys the caller's Supabase session (clears
 * the auth cookies), logs a `logout` activity event, and returns the
 * standardized {@link ApiResponse} success envelope.
 *
 * The route is idempotent — calling sign-out with no session is a no-op for
 * Supabase but still returns `{success: true}`.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "signedOut": true } }
 * ```
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";

export async function POST(): Promise<NextResponse> {
  try {
    const authService = await createAuthService();
    await authService.signOut();
    return apiSuccess({ signedOut: true });
  } catch (err) {
    return apiError(err);
  }
}
