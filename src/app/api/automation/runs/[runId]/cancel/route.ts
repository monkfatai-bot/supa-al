/**
 * Supa AI — Phase 9A Automation — cancel a run.
 *
 * POST `/api/automation/runs/:runId/cancel`  — cancel a pending or running run.
 *
 * @module @/app/api/automation/runs/[runId]/cancel/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function POST(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { runId } = await ctx.params;
    if (!runId) throw new NotFoundError("WorkflowRun");

    const service = await createAutomationService();
    const run = await service.cancelRun(runId);
    return apiSuccess({ run });
  } catch (err) {
    return apiError(err);
  }
}
