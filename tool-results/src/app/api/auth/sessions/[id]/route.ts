/**
 * Supa AI — Single-session route.
 *
 * DELETE `/api/auth/sessions/:id` — revokes one specific session by id.
 * The caller MUST own the session (the data service enforces this by
 * filtering on `user_id`).
 *
 * Requires a valid session.
 *
 * Response envelope (success):
 * ```json
 * { "success": true, "data": { "revoked": true } }
 * ```
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getSession } from "@/lib/auth/session";
import { createSessionService } from "@/lib/auth/sessions";
import { AuthenticationError, NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const sessionCtx = await getSession();
    if (!sessionCtx) {
      throw new AuthenticationError("Sign in to continue.");
    }

    const { id } = await ctx.params;
    if (!id) {
      throw new NotFoundError("Session");
    }

    const sessionService = await createSessionService();
    // revokeSession throws NotFoundError if the session doesn't exist or
    // doesn't belong to the caller.
    await sessionService.revokeSession(sessionCtx.user.id, id);

    return apiSuccess({ revoked: true });
  } catch (err) {
    return apiError(err);
  }
}
