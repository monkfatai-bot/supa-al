/**
 * Supa AI — Resend email-verification route.
 *
 * POST `/api/auth/resend-verification` — re-sends the signup verification
 * email to the currently-authenticated user.
 *
 * Requires a valid session. We require a session (rather than accepting an
 * arbitrary email) so anonymous visitors cannot use this endpoint to
 * enumerate which emails have pending verifications.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "sent": true } }
 * ```
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";

export async function POST(): Promise<NextResponse> {
  try {
    await requireAuth();
    const authService = await createAuthService();
    await authService.resendVerificationEmail();
    return apiSuccess({ sent: true });
  } catch (err) {
    return apiError(err);
  }
}
