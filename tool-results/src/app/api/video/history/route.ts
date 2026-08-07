/**
 * Supa AI — Video history list route.
 *
 * GET `/api/video/history?status=&provider=&type=&search=&limit=&offset=`
 *
 * Paginated list of the caller's video generations, newest first.
 * Optional filters:
 *   - `status`    — exact match (`pending|processing|completed|failed|cancelled`).
 *   - `provider`  — exact match (`runway|kling|luma|pika|replicate|fal|google|openai`).
 *   - `type`      — exact match (`text-to-video|image-to-video|video-to-video`).
 *   - `search`    — case-insensitive substring on the prompt.
 *
 * @module @/app/api/video/history/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createVideoService } from "@/lib/video";
import { validateInput } from "@/lib/validation";
import { listVideoQuerySchema } from "@/lib/validation/video";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listVideoQuerySchema, {
      status: url.searchParams.get("status") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createVideoService();
    const generations = await service.list(user.id, query);

    return apiSuccess({ generations }, {
      pagination: { hasMore: generations.length === (query.limit ?? 30) },
    });
  } catch (err) {
    return apiError(err);
  }
}
