/**
 * Supa AI — GET /api/marketing/changelog/[slug]
 *
 * Fetch a single published changelog entry by slug. Rate-limited per-IP.
 *
 * @module @/app/api/marketing/changelog/[slug]
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { slugSchema } from "@/lib/validation/common";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const { slug } = await ctx.params;
    const validatedSlug = validateInput(slugSchema, slug);

    const service = await getMarketingService();
    const entry = await service.getChangelogEntry(validatedSlug);

    return apiSuccess(entry);
  } catch (err) {
    return apiError(err);
  }
}
