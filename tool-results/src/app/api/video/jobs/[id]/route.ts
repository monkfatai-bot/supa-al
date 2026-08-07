/**
 * Supa AI — Single video job route.
 *
 * GET  `/api/video/jobs/:id`  — fetch a single job + its generation, AND
 *                               poll the provider for the latest status
 *                               (mutates the DB row in-place when the
 *                               provider reports progress/completion).
 * POST `/api/video/jobs/:id`  — `action: 'retry' | 'cancel'`.
 *
 * @module @/app/api/video/jobs/[id]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoJobQueue } from "@/lib/video";
import { validateInput } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const jobActionSchema = z
  .object({
    action: z.enum(["retry", "cancel"]),
  })
  .strict();

export async function GET(
  _req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("VideoJob");

    const queue = createVideoJobQueue();
    const result = await queue.pollJob(user.id, id);

    return apiSuccess({
      job: result,
      generation: result.generation,
    });
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
    if (!id) throw new NotFoundError("VideoJob");

    const input = validateInput(jobActionSchema, await req.json());
    const queue = createVideoJobQueue();

    if (input.action === "cancel") {
      const result = await queue.cancelJob(user.id, id);
      return apiSuccess({ job: result });
    }
    const result = await queue.retryJob(user.id, id);
    return apiSuccess({ job: result });
  } catch (err) {
    return apiError(err);
  }
}
