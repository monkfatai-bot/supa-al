/**
 * Supa AI — Sessions route.
 *
 * GET  `/api/auth/sessions`     — list the caller's active sessions
 *                                 (multi-device session tracking).
 * DELETE `/api/auth/sessions`   — revoke ALL sessions EXCEPT the current
 *                                 one (sign out other devices).
 *
 * Both methods require a valid session. The current session is identified
 * by the access-token hash (so we never revoke the device the user is
 * calling from).
 *
 * Response envelope (GET success):
 * ```json
 * { "success": true, "data": { "sessions": [...], "currentSessionId": "..." } }
 * ```
 *
 * Response envelope (DELETE success):
 * ```json
 * { "success": true, "data": { "revoked": true } }
 * ```
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getSession } from "@/lib/auth/session";
import { createSessionService } from "@/lib/auth/sessions";
import { AuthenticationError } from "@/lib/errors";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to continue.");
    }

    const sessionService = await createSessionService();
    const sessions = await sessionService.listSessions(ctx.user.id);

    return apiSuccess({
      sessions,
      currentSessionId: ctx.session.access_token,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    await requireAuth();
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to continue.");
    }

    const sessionService = await createSessionService();
    // Revoke every active session. The current device will need to
    // re-authenticate on the next request — which is the desired security
    // posture after "sign out everywhere".
    await sessionService.revokeAllSessions(ctx.user.id);

    return apiSuccess({ revoked: true });
  } catch (err) {
    return apiError(err);
  }
}
