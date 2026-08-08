/**
 * Supa AI — Phase 9A Automation — workflow runs list route.
 *
 * GET  `/api/automation/workflows/:id/runs`  — list recent runs for a workflow.
 * POST `/api/automation/workflows/:id/runs`  — start a manual run.
 *
 * @module @/app/api/automation/workflows/[id]/runs/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";
import { parseJsonBody } from "../../../_helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");

    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : 30;

    const service = await createAutomationService();
    const runs = await service.listRunsForWorkflow(id, limit);
    return apiSuccess({ runs });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");

    const body = await parseJsonBody(req);
    const payload = (body.payload as Record<string, unknown> | undefined) ?? {};

    const service = await createAutomationService();
    const run = await service.startRun(id, payload);
    return apiSuccess({ run });
  } catch (err) {
    return apiError(err);
  }
}
