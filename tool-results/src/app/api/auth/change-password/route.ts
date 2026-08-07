/**
 * Supa AI — Change-password route.
 *
 * POST `/api/auth/change-password` — changes the password for the
 * currently-authenticated user. Requires re-authentication with the current
 * password (defense against a stolen session cookie being used to lock the
 * user out).
 *
 * Requires a valid session. After a successful change:
 *   - All other sessions are revoked (other devices signed out).
 *   - A `password_change` activity log is written.
 *   - A `security` notification is created.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "changed": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";
import { changePasswordSchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();

    const input = validateInput(changePasswordSchema, await req.json());
    const authService = await createAuthService();
    await authService.changePassword(input.currentPassword, input.newPassword);

    return apiSuccess({ changed: true });
  } catch (err) {
    return apiError(err);
  }
}
