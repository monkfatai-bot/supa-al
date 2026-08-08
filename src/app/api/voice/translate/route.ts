/**
 * Supa AI — Voice translate route (async).
 *
 * POST `/api/voice/translate`
 *
 * Body: JSON matching {@link translateSchema}.
 *
 * Creates a generation + job row, schedules the background processor,
 * and returns immediately so the client can poll
 * `/api/voice/jobs/:id` for status.
 *
 * Response envelope (success, 202):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "generation": { ...VoiceGeneration },
 *     "job": { ...VoiceJob }
 *   }
 * }
 * ```
 *
 * @module @/app/api/voice/translate/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { assertVoiceWorkspaceMembership, createVoiceService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { translateSchema } from "@/lib/validation/voice";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(translateSchema, await req.json());

    const workspaceId = input.workspaceId ?? user.id;
    await assertVoiceWorkspaceMembership(workspaceId, user.id);
    const service = await createVoiceService();
    const result = await service.translate({
      workspaceId,
      userId: user.id,
      audioUploadId: input.audioUploadId,
      provider: input.provider,
      model: input.model,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
    });

    return apiSuccess(result, {});
  } catch (err) {
    return apiError(err);
  }
}
