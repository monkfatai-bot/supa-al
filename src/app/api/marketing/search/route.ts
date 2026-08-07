/**
 * Supa AI — GET /api/marketing/search
 *
 * Cross-content search across blog posts, documentation pages, and
 * changelog entries. Uses Postgres FTS indexes.
 *
 *   ?q=&limit=&kinds=blog,docs,changelog
 *
 * `kinds` is optional; when omitted, all three kinds are searched.
 *
 * @module @/app/api/marketing/search
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { safeValidate } from "@/lib/validation";
import { searchQuerySchema } from "@/lib/validation/marketing";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const url = new URL(req.url);
    const params: Record<string, string | undefined> = {
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      kinds: url.searchParams.get("kinds") ?? undefined,
    };

    const parsed = safeValidate(searchQuerySchema, params);
    if (!parsed.ok) {
      return apiError(parsed.error);
    }

    const service = await getMarketingService();
    const results = await service.search({
      q: parsed.value.q,
      limit: parsed.value.limit,
      kinds: parsed.value.kinds,
    });

    return apiSuccess(results, {
      pagination: { hasMore: false, total: results.length },
    });
  } catch (err) {
    return apiError(err);
  }
}
