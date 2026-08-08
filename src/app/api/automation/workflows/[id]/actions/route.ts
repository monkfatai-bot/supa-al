/**
 * Supa AI — Phase 9A Automation — workflow actions list + create route.
 *
 * GET  `/api/automation/workflows/:id/actions`  — list actions, ordered by `order`.
 * POST `/api/automation/workflows/:id/actions`  — create a new action.
 *
 * @module @/app/api/automation/workflows/[id]/actions/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { createActionSchema } from "@/lib/validation/automation";
import { parseJsonBody } from "../../../_helpers";

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

    const service = await createAutomationService();
    const actions = await service.listActions(id);
    return apiSuccess({ actions });
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
    const input = validateInput(createActionSchema, body);

    const service = await createAutomationService();
    const action = await service.createAction(id, input);
    return apiSuccess({ action });
  } catch (err) {
    return apiError(err);
  }
}
