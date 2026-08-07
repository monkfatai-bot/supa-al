/**
 * Supa AI — Phase 9B Builder — collaboration presence.
 *
 * GET  `/api/builder/workflows/:id/presence`
 *      — list presence rows for the workflow (the caller's own row).
 * POST `/api/builder/workflows/:id/presence`
 *      — upsert the caller's cursor + selected nodes for the workflow.
 *
 * @module @/app/api/builder/workflows/[id]/presence/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { upsertPresenceSchema } from "@/lib/validation/builder";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowId } = await ctx.params;
    if (!workflowId) {
      return apiError(new Error("workflowId is required."), 400);
    }

    const service = await createBuilderService();
    const presence = await service.listPresence(user.id, workflowId);
    return apiSuccess({ presence });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id: workflowId } = await ctx.params;
    const body = await req.json();
    const input = validateInput(upsertPresenceSchema, { ...body, workflowId });

    const service = await createBuilderService();
    const presence = await service.upsertPresence(user.id, input);
    return apiSuccess({ presence });
  } catch (err) {
    return apiError(err);
  }
}
