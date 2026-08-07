/**
 * Supa AI — Voice jobs route.
 *
 * GET `/api/voice/jobs` — list jobs. Optional query params: `status`,
 *                        `generationId`, `limit`, `offset`.
 *
 * @module @/app/api/voice/jobs/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createJobQueueService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { listJobsQuerySchema } from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const opts = validateInput(listJobsQuerySchema, {
      status: url.searchParams.get("status") ?? undefined,
      generationId: url.searchParams.get("generationId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const workspaceId = user.id;
    const service = createJobQueueService();
    const jobs = await service.list(workspaceId, opts);
    return apiSuccess({ jobs });
  } catch (err) {
    return apiError(err);
  }
}
