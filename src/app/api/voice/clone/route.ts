/**
 * Supa AI — Voice clone route (async).
 *
 * POST `/api/voice/clone`
 *
 * Body: JSON matching {@link cloneSchema}.
 *
 * @module @/app/api/voice/clone/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { assertVoiceWorkspaceMembership, createVoiceService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { cloneSchema } from "@/lib/validation/voice";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(cloneSchema, await req.json());

    const workspaceId = input.workspaceId ?? user.id;
    await assertVoiceWorkspaceMembership(workspaceId, user.id);
    const service = await createVoiceService();
    const result = await service.clone({
      workspaceId,
      userId: user.id,
      audioUploadId: input.audioUploadId,
      provider: input.provider,
      name: input.name,
      description: input.description,
    });

    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
