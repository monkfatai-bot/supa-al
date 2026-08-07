/**
 * Supa AI — GET /api/marketing/docs
 *
 * List published documentation pages. Supports optional filters:
 *
 *   ?limit=&category=&section=&sort=
 *
 * @module @/app/api/marketing/docs
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { safeValidate } from "@/lib/validation";
import { listDocsQuerySchema } from "@/lib/validation/marketing";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const url = new URL(req.url);
    const params: Record<string, string | undefined> = {
      limit: url.searchParams.get("limit") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      section: url.searchParams.get("section") ?? undefined,
      sort: url.searchParams.get("sort") ?? undefined,
    };

    const parsed = safeValidate(listDocsQuerySchema, params);
    if (!parsed.ok) {
      return apiError(parsed.error);
    }

    const service = await getMarketingService();
    const docs = await service.listDocs({
      limit: parsed.value.limit,
      cursor: parsed.value.cursor,
      category: parsed.value.category,
      section: parsed.value.section,
      sort: parsed.value.sort,
    });

    return apiSuccess(docs, {
      pagination: { hasMore: false, total: docs.length },
    });
  } catch (err) {
    return apiError(err);
  }
}
