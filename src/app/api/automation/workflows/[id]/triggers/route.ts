/**
 * Supa AI — Phase 9A Automation — workflow triggers list + create route.
 *
 * GET  `/api/automation/workflows/:id/triggers`  — list triggers.
 * POST `/api/automation/workflows/:id/triggers`  — create a new trigger.
 *
 * @module @/app/api/automation/workflows/[id]/triggers/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { createTriggerSchema } from "@/lib/validation/automation";
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
    const triggers = await service.listTriggers(id);
    return apiSuccess({ triggers });
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
    const input = validateInput(createTriggerSchema, body);

    const service = await createAutomationService();
    const trigger = await service.createTrigger(id, input);
    return apiSuccess({ trigger });
  } catch (err) {
    return apiError(err);
  }
}
