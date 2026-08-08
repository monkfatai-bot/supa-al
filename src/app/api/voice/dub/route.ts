/**
 * Supa AI — Voice dub route (async).
 *
 * POST `/api/voice/dub`
 *
 * Body: JSON matching {@link dubSchema}.
 *
 * @module @/app/api/voice/dub/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { assertVoiceWorkspaceMembership, createVoiceService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { dubSchema } from "@/lib/validation/voice";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(dubSchema, await req.json());

    const workspaceId = input.workspaceId ?? user.id;
    await assertVoiceWorkspaceMembership(workspaceId, user.id);
    const service = await createVoiceService();
    const result = await service.dub({
      workspaceId,
      userId: user.id,
      audioUploadId: input.audioUploadId,
      provider: input.provider,
      model: input.model,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      voiceId: input.voiceId,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
