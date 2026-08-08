/**
 * Supa AI — Phase 9A Automation — run logs route.
 *
 * GET `/api/automation/workflows/:id/runs/:runId/logs`  — list logs for a run.
 *
 * @module @/app/api/automation/workflows/[id]/runs/[runId]/logs/route
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
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id, runId } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");
    if (!runId) throw new NotFoundError("WorkflowRun");

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 100;

    const service = await createAutomationService();
    const logs = await service.listLogs(runId, limit);
    return apiSuccess({ logs });
  } catch (err) {
    return apiError(err);
  }
}
