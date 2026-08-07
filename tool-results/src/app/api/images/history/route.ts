/**
 * Supa AI — Image generation history route.
 *
 * GET `/api/images/history`
 *
 * Returns a paginated list of the caller's image generations, newest
 * first. Accepts the query params described by {@link listImagesQuerySchema}.
 *
 * @module @/app/api/images/history/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { listImageHistory } from "@/lib/image";
import { validateInput } from "@/lib/validation";
import { listImagesQuerySchema } from "@/lib/validation/image";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);

    const input = validateInput(listImagesQuerySchema, {
      status: url.searchParams.get("status") ?? undefined,
      provider: url.searchParams.get("provider") ?? undefined,
      model: url.searchParams.get("model") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit")
        ? Number(url.searchParams.get("limit"))
        : undefined,
      offset: url.searchParams.get("offset")
        ? Number(url.searchParams.get("offset"))
        : undefined,
    });

    const result = await listImageHistory(user.id, input);

    return apiSuccess(
      { generations: result.generations },
      { pagination: { hasMore: result.hasMore } },
    );
  } catch (err) {
    return apiError(err);
  }
}
