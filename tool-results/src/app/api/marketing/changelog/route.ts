/**
 * Supa AI — GET /api/marketing/changelog
 *
 * List published changelog entries. Supports optional filters:
 *
 *   ?limit=&category=&featured=&sort=
 *
 * @module @/app/api/marketing/changelog
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { safeValidate } from "@/lib/validation";

const listChangelogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(512).optional(),
    category: z
      .string()
      .trim()
      .max(64)
      .optional(),
    featured: z.coerce.boolean().optional(),
    sort: z.enum(["asc", "desc"]).optional(),
  })
  .strict();

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const url = new URL(req.url);
    const params: Record<string, string | undefined> = {
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      featured: url.searchParams.get("featured") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    };

    const parsed = safeValidate(listChangelogQuerySchema, params);
    if (!parsed.ok) {
      return apiError(parsed.error);
    }

    const service = await getMarketingService();
    const entries = await service.listChangelog({
      limit: parsed.value.limit,
      cursor: parsed.value.cursor,
      category: parsed.value.category,
      featured: parsed.value.featured,
      sort: parsed.value.sort,
    });

    return apiSuccess(entries, {
      pagination: { hasMore: false, total: entries.length },
    });
  } catch (err) {
    return apiError(err);
  }
}
