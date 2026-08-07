/**
 * Supa AI — Phase 9B Builder — layout get + save.
 *
 * GET  `/api/builder/workflows/:id/layout?workspaceId=…`
 *      — get the saved viewport + meta for the workflow.
 * POST `/api/builder/workflows/:id/layout`
 *      — upsert the layout (body: { workspaceId, viewport, meta? }).
 *
 * @module @/app/api/builder/workflows/[id]/layout/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { saveLayoutSchema } from "@/lib/validation/builder";

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
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workflowId || !workspaceId) {
      return apiError(new Error("workflowId and workspaceId are required."), 400);
    }

    const service = await createBuilderService();
    const layout = await service.getLayout(user.id, workspaceId, workflowId);
    return apiSuccess({ layout });
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
    const workspaceId = (body?.workspaceId ?? "") as string;
    if (!workflowId || !workspaceId) {
      return apiError(new Error("workflowId and workspaceId are required."), 400);
    }
    const input = validateInput(saveLayoutSchema, {
      viewport: body.viewport,
      meta: body.meta,
    });

    const service = await createBuilderService();
    const layout = await service.saveLayout(
      user.id,
      workspaceId,
      workflowId,
      input.viewport,
      input.meta,
    );
    return apiSuccess({ layout });
  } catch (err) {
    return apiError(err);
  }
}
