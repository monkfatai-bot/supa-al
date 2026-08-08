/**
 * Supa AI — Voice transcribe route (STT).
 *
 * POST `/api/voice/transcribe`
 *
 * Body: JSON matching {@link transcribeSchema}.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "generation": { ...VoiceGeneration },
 *     "transcript": { ...VoiceTranscript }
 *   }
 * }
 * ```
 *
 * @module @/app/api/voice/transcribe/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { assertVoiceWorkspaceMembership, createVoiceService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { transcribeSchema } from "@/lib/validation/voice";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(transcribeSchema, await req.json());

    const workspaceId = input.workspaceId ?? user.id;
    await assertVoiceWorkspaceMembership(workspaceId, user.id);
    const service = await createVoiceService();
    const result = await service.transcribe({
      workspaceId,
      userId: user.id,
      audioUploadId: input.audioUploadId,
      provider: input.provider,
      model: input.model,
      language: input.language,
      speakerLabels: input.speakerLabels,
      wordTimestamps: input.wordTimestamps,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
