/**
 * Supa AI — Phase 9B Builder — debug session control.
 *
 * GET  `/api/builder/workflows/:id/debug?workspaceId=…`
 *      — fetch the latest debug session for the workflow (or null).
 * POST `/api/builder/workflows/:id/debug`
 *      — start / pause / resume / stop the debug session.
 *
 * Body shape: `{ action: "start" | "pause" | "resume" | "stop" }`.
 * `start` creates a fresh session in `running` state. `pause` flips
 * the latest session to `paused`. `resume` flips it back to `running`.
 * `stop` marks the session as `completed`.
 *
 * @module @/app/api/builder/workflows/[id]/debug/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { validateInput } from "@/lib/validation";
import { debugMutationSchema } from "@/lib/validation/builder";

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
    const session = await service.getDebugSession(user.id, workspaceId, workflowId);
    return apiSuccess({ session });
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
    const input = validateInput(debugMutationSchema, { action: body?.action });

    const service = await createBuilderService();

    if (input.action === "start") {
      const session = await service.startDebug(user.id, workspaceId, workflowId);
      return apiSuccess({ session });
    }

    // For pause/resume/stop, fetch the latest session then patch it.
    const latest = await service.getDebugSession(user.id, workspaceId, workflowId);
    if (!latest) {
      return apiError(new Error("No debug session to control. Start one first."), 404);
    }

    const nextStatus =
      input.action === "pause"
        ? "paused"
        : input.action === "resume"
          ? "running"
          : "completed";
    const session = await service.updateDebugStatus(
      user.id,
      workspaceId,
      latest.id,
      nextStatus,
    );
    return apiSuccess({ session });
  } catch (err) {
    return apiError(err);
  }
}
