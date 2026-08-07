/**
 * Supa AI — Phase 9A Automation — workflow variables list + create route.
 *
 * GET  `/api/automation/workflows/:id/variables`  — list variables.
 * POST `/api/automation/workflows/:id/variables`  — create a new variable.
 *
 * @module @/app/api/automation/workflows/[id]/variables/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { createVariableSchema } from "@/lib/validation/automation";
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

    const service = createAutomationService();
    const variables = await service.listVariables(id);
    return apiSuccess({ variables });
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
    const input = validateInput(createVariableSchema, body);

    const service = createAutomationService();
    const variable = await service.createVariable(id, input);
    return apiSuccess({ variable });
  } catch (err) {
    return apiError(err);
  }
}
