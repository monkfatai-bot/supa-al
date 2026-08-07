/**
 * Supa AI — Voice history route.
 *
 * GET `/api/voice/history`
 *
 * Optional query params: `type`, `provider`, `status`, `limit`, `offset`.
 *
 * @module @/app/api/voice/history/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createHistoryService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { listHistoryQuerySchema } from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const opts = validateInput(listHistoryQuerySchema, {
      type: url.searchParams.get("type") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const workspaceId = user.id;
    const service = createHistoryService();
    const generations = await service.list(workspaceId, opts);
    return apiSuccess({ generations });
  } catch (err) {
    return apiError(err);
  }
}
