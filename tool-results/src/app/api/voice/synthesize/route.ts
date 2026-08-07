/**
 * Supa AI — Voice synthesize route (TTS).
 *
 * POST `/api/voice/synthesize`
 *
 * Body: JSON matching {@link synthesizeSchema}.
 *
 * Response envelope (success):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "generation": { ...VoiceGeneration },
 *     "audioUrl": "https://..."
 *   }
 * }
 * ```
 *
 * @module @/app/api/voice/synthesize/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVoiceService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { synthesizeSchema } from "@/lib/validation/voice";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const input = validateInput(synthesizeSchema, body);

    const workspaceId = input.workspaceId ?? user.id;
    const service = await createVoiceService();
    const result = await service.synthesize({
      workspaceId,
      userId: user.id,
      text: input.text,
      provider: input.provider,
      model: input.model,
      voiceId: input.voiceId,
      language: input.language,
      format: input.format,
      settings: input.settings as Record<string, unknown> | undefined,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
