/**
 * Supa AI — Linked accounts route.
 *
 * GET `/api/linked-accounts` — list every provider linked to the caller's
 * account (email, google, github, microsoft, apple). Requires a valid
 * session. RLS on `linked_accounts` is owner-scoped so only the caller's
 * rows are visible.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "accounts": [ ...linkedAccountRow ] } }
 * ```
 *
 * @module @/app/api/linked-accounts/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createLinkedAccountsService } from "@/lib/auth/linked-accounts";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const service = await createLinkedAccountsService();
    const accounts = await service.list(user.id);
    return apiSuccess({ accounts });
  } catch (err) {
    return apiError(err);
  }
}
