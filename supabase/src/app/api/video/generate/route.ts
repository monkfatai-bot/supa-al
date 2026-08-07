/**
 * Supa AI — Video generate route.
 *
 * POST `/api/video/generate`
 *
 * Validates the request body, kicks off a new generation via
 * {@link VideoService.generate}, and returns the persisted
 * `video_generations` row immediately. The actual provider call is
 * deferred to the next event-loop tick via the job queue; the UI polls
 * `/api/video/jobs/[id]` for the resolved status.
 *
 * Workspace resolution: Phase 5 has no `workspaces` table yet — the
 * caller's `userId` is used as the synthetic workspace id (mirrors the
 * Phase 9C pattern).
 *
 * @module @/app/api/video/generate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoService } from "@/lib/video";
import { validateInput } from "@/lib/validation";
import { generateVideoSchema } from "@/lib/validation/video";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(generateVideoSchema, await req.json());

    const service = await createVideoService();
    const generation = await service.generate(user.id, user.id, {
      provider: input.provider,
      model: input.model,
      prompt: input.prompt,
      type: input.type,
      sourceImageUrl: input.sourceImageUrl,
      sourceVideoUrl: input.sourceVideoUrl,
      duration: input.duration,
      fps: input.fps,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
    });

    return apiSuccess({ generation }, { pagination: { hasMore: false } });
  } catch (err) {
    return apiError(err);
  }
}
