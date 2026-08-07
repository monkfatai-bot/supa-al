/**
 * Supa AI — Provider health route.
 *
 * GET `/api/chat/health`
 *
 * Returns the per-provider health status (success/error counts, average
 * latency, last error) for the admin dashboard. Reads from the
 * `provider_health` table.
 *
 * Requires a valid session. (A future phase can add an admin-only gate
 * here — for now every authenticated user can see provider health, which
 * is useful for power users debugging their AI calls.)
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": { "providers": [...] }
 * }
 * ```
 *
 * @module @/app/api/chat/health/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createProviderHealthService } from "@/lib/chat";

export async function GET(): Promise<NextResponse> {
  try {
    await requireAuth();

    const service = createProviderHealthService();
    const providers = await service.listAll();

    return apiSuccess({ providers });
  } catch (err) {
    return apiError(err);
  }
}
