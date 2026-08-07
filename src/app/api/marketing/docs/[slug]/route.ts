/**
 * Supa AI — GET /api/marketing/docs/[slug]
 *
 * Fetch a single published documentation page by slug. Rate-limited per-IP.
 *
 * @module @/app/api/marketing/docs/[slug]
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
    const doc = await service.getDoc(validatedSlug);

    return apiSuccess(doc);
  } catch (err) {
    return apiError(err);
  }
}
