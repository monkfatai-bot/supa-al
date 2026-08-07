/**
 * Supa AI — Voice transcripts route.
 *
 * GET `/api/voice/transcripts`
 *
 * Optional query params: `generationId`, `limit`, `offset`.
 *
 * @module @/app/api/voice/transcripts/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createTranscriptService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { listTranscriptsQuerySchema } from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const opts = validateInput(listTranscriptsQuerySchema, {
      generationId: url.searchParams.get("generationId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const workspaceId = user.id;
    const service = createTranscriptService();
    const transcripts = await service.list(workspaceId, opts);
    return apiSuccess({ transcripts });
  } catch (err) {
    return apiError(err);
  }
}
