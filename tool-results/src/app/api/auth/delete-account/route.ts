/**
 * Supa AI — Delete-account route.
 *
 * POST `/api/auth/delete-account` — permanently deletes the caller's
 * account. Requires the current password for verification (defense against
 * a stolen session cookie being used to delete the account).
 *
 * Body: `{ password: string, confirm: 'DELETE' }` — the caller MUST type
 * `DELETE` into the confirm field. This is a UX guard, not a security
 * mechanism (the password is the real verifier).
 *
 * Requires a valid session. After deletion the caller's session is destroyed
 * and an `account_deleted` activity log is written (best-effort, before the
 * user row is gone).
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "deleted": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAuthService } from "@/lib/auth/auth-service";
import { validateInput } from "@/lib/validation";
import { deleteAccountSchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();

    const input = validateInput(deleteAccountSchema, await req.json());
    const authService = await createAuthService();
    await authService.deleteAccount(input.password);

    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
