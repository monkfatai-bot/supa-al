/**
 * Supa AI — GET /api/marketing/blog
 *
 * List published blog posts. Supports optional filters via query params:
 *
 *   ?limit=&category=&tag=&featured=&sort=
 *
 * Rate-limited per-IP via the API preset so crawlers can't hammer the
 * endpoint.
 *
 * @module @/app/api/marketing/blog
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { safeValidate } from "@/lib/validation";
import { listBlogPostsQuerySchema } from "@/lib/validation/marketing";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const url = new URL(req.url);
    const params: Record<string, string | undefined> = {
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      featured: url.searchParams.get("featured") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    };

    const parsed = safeValidate(listBlogPostsQuerySchema, params);
    if (!parsed.ok) {
      return apiError(parsed.error);
    }

    const service = await getMarketingService();
    const posts = await service.listBlogPosts({
      limit: parsed.value.limit,
      cursor: parsed.value.cursor,
      category: parsed.value.category,
      tag: parsed.value.tag,
      featured: parsed.value.featured,
      sort: parsed.value.sort,
    });

    return apiSuccess(posts, {
      pagination: { hasMore: false, total: posts.length },
    });
  } catch (err) {
    return apiError(err);
  }
}
