/**
 * Supa AI — Change-email route.
 *
 * POST `/api/auth/change-email` — initiates an email change. Supabase
 * triggers its own email-change verification flow (sends a confirmation
 * email to the NEW address; the change only lands when the user clicks the
 * link).
 *
 * Requires a valid session. This route returns immediately — the change is
 * NOT reflected on the user's account until they verify the new email.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "pendingVerification": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";
import { changeEmailSchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();

    const input = validateInput(changeEmailSchema, await req.json());
    const authService = await createAuthService();
    await authService.changeEmail(input.newEmail);

    return apiSuccess({ pendingVerification: true });
  } catch (err) {
    return apiError(err);
  }
}
