/**
 * Supa AI — Voice models catalog route.
 *
 * GET `/api/voice/models`
 *
 * Optional query params: `provider`, `type` (tts | stt).
 *
 * Returns the catalog from the `voice_models` table (or the in-memory
 * provider catalog when the table is empty — e.g. before the 0008
 * migration has been applied).
 *
 * @module @/app/api/voice/models/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCatalogService } from "@/lib/voice";
import { validateInput } from "@/lib/validation";
import { listModelsQuerySchema } from "@/lib/validation/voice";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const opts = validateInput(listModelsQuerySchema, {
      provider: url.searchParams.get("provider") ?? undefined,
      type: url.searchParams.get("type") as "tts" | "stt" | undefined,
    });

    const service = createCatalogService();
    const models = await service.list(opts);
    return apiSuccess({ models });
  } catch (err) {
    return apiError(err);
  }
}
