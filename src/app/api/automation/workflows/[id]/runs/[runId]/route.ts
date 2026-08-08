/**
 * Supa AI — Phase 9A Automation — single-run route.
 *
 * GET `/api/automation/workflows/:id/runs/:runId`  — fetch a single run.
 *
 * @module @/app/api/automation/workflows/[id]/runs/[runId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string; runId: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, runId } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");
    if (!runId) throw new NotFoundError("WorkflowRun");

    const service = await createAutomationService();
    const run = await service.getRun(runId);
    if (!run) throw new NotFoundError("WorkflowRun", runId);

    return apiSuccess({ run });
  } catch (err) {
    return apiError(err);
  }
}
