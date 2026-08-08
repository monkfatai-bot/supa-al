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

function toPublicVariable(variable: { id: string; key: string; value: string | null; type: string; is_secret: boolean }) {
  if (variable.is_secret) {
    return { id: variable.id, key: variable.key, type: variable.type, isSecret: true, hasValue: variable.value !== null };
  }
  return { id: variable.id, key: variable.key, type: variable.type, isSecret: false, hasValue: variable.value !== null, value: variable.value };
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
    const variables = await service.listVariables(id);
    return apiSuccess({ variables: variables.map(toPublicVariable) });
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

    const service = await createAutomationService();
    const variable = await service.createVariable(id, input);
    return apiSuccess({ variable: toPublicVariable(variable) });
  } catch (err) {
    return apiError(err);
  }
}
