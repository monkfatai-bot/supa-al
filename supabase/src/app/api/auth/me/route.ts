/**
 * Supa AI — Current-user route.
 *
 * GET `/api/auth/me` — returns the authenticated user's full account
 * snapshot: the Supabase `User` (sanitized — never the access token), the
 * rich `Profile` row, the `UserSettings` row, and the dashboard data
 * (notifications, recent activity, active sessions) assembled by the profile
 * service.
 *
 * Returns 401 with the standard `ApiResponse` failure envelope when the
 * caller is not authenticated.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "user": {...},
 *     "profile": {...},
 *     "settings": {...},
 *     "dashboard": {...}
 *   }
 * }
 * ```
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getSession } from "@/lib/auth/session";
import { createProfileService } from "@/lib/auth/profile";
import { AuthenticationError } from "@/lib/errors";

export async function GET(): Promise<NextResponse> {
  try {
    const ctx = await getSession();
    if (!ctx) {
      throw new AuthenticationError("Sign in to continue.");
    }

    const profileService = await createProfileService();
    const dashboard = await profileService.getDashboardData(ctx.user.id);

    return apiSuccess({
      user: ctx.user,
      ...dashboard,
    });
  } catch (err) {
    return apiError(err);
  }
}
