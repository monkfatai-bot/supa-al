/**
 * Supa AI — Reset-password route.
 *
 * POST `/api/auth/reset-password` — sets a new password using the session
 * established when the user clicked the reset link in the email (Supabase's
 * `exchangeCodeForSession` runs in the `/api/auth/callback` route and
 * establishes the session; the user is then redirected to a "set new
 * password" page that POSTs here).
 *
 * Requires a valid session. The new password is validated against the strong
 * password policy (`updatePasswordSchema` requires `password` +
 * `confirmPassword` to match).
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "reset": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";
import { updatePasswordSchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Require an active session (the user must have clicked the reset link
    // and landed on the reset-password page).
    await requireAuth();

    const input = validateInput(updatePasswordSchema, await req.json());
    const authService = await createAuthService();
    await authService.resetPassword(input.password);

    return apiSuccess({ reset: true });
  } catch (err) {
    return apiError(err);
  }
}
