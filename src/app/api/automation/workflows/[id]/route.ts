/**
 * Supa AI — Phase 9A Automation — single-workflow route.
 *
 * GET    `/api/automation/workflows/:id`  — fetch a single workflow + relations.
 * PATCH  `/api/automation/workflows/:id`  — partial update (name, status, config, etc.).
 * DELETE `/api/automation/workflows/:id`  — hard-delete (cascades to triggers,
 *                                           actions, variables, logs).
 *
 * @module @/app/api/automation/workflows/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { updateWorkflowSchema } from "@/lib/validation/automation";
import { parseJsonBody } from "../../_helpers";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");

    const service = createAutomationService();
    const workflow = await service.getWorkflow(id);
    if (!workflow) throw new NotFoundError("Workflow", id);

    return apiSuccess({ workflow });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");

    const body = await parseJsonBody(req);
    const input = validateInput(updateWorkflowSchema, body);

    const service = createAutomationService();
    const workflow = await service.updateWorkflow(id, input);
    return apiSuccess({ workflow });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Workflow");

    const service = createAutomationService();
    await service.deleteWorkflow(id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
