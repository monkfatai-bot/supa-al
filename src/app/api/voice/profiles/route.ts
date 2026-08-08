/**
 * Supa AI — Voice profiles route.
 *
 * GET  `/api/voice/profiles` — list the workspace's voice profiles.
 *                            Optional query params: `provider`,
 *                            `isCloned`, `limit`, `offset`.
 * POST `/api/voice/profiles` — create a new voice profile.
 *
 * @module @/app/api/voice/profiles/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { assertVoiceWorkspaceMembership, createProfileService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import {
  createProfileSchema,
  listProfilesQuerySchema,
} from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const isClonedParam = url.searchParams.get("isCloned");
    const opts = validateInput(listProfilesQuerySchema, {
      provider: url.searchParams.get("provider") ?? undefined,
      isCloned:
        isClonedParam === null
          ? undefined
          : isClonedParam === "true",
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const workspaceId = user.id;
    const service = createProfileService();
    const profiles = await service.list(workspaceId, opts);
    return apiSuccess({ profiles });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createProfileSchema, await req.json());
    const workspaceId = input.workspaceId ?? user.id;
    await assertVoiceWorkspaceMembership(workspaceId, user.id);

    const service = createProfileService();
    const profile = await service.create({
      workspace_id: workspaceId,
      user_id: user.id,
      name: input.name,
      provider: input.provider,
      voice_id: input.voiceId,
      language: input.language ?? null,
      settings: (input.settings ?? null) as never,
      is_cloned: input.isCloned ?? false,
      sample_audio_url: input.sampleAudioUrl ?? null,
      metadata: (input.metadata ?? null) as never,
    });
    return apiSuccess({ profile });
  } catch (err) {
    return apiError(err);
  }
}
