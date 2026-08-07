/**
 * Supa AI — Single voice job route.
 *
 * GET  `/api/voice/jobs/:id` — fetch a single job.
 * POST `/api/voice/jobs/:id` — retry or cancel a job.
 *                              Body: `{ "action": "retry" | "cancel" }`.
 *
 * @module @/app/api/voice/jobs/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createJobQueueService } from "@/lib/voice";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { jobActionSchema } from "@/lib/validation/voice";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Voice job");

    const workspaceId = user.id;
    const service = createJobQueueService();
    const job = await service.get(workspaceId, id);
    if (!job) throw new NotFoundError("Voice job", id);

    return apiSuccess({ job });
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
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Voice job");
    const input = validateInput(jobActionSchema, await req.json());

    const workspaceId = user.id;
    const service = createJobQueueService();
    const job =
      input.action === "retry"
        ? await service.retry(workspaceId, id)
        : await service.cancel(workspaceId, id);

    return apiSuccess({ job });
  } catch (err) {
    return apiError(err);
  }
}
