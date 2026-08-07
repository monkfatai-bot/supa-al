/**
 * Supa AI — POST /api/marketing/newsletter
 *
 * Public endpoint to subscribe (or re-subscribe) an email to the
 * newsletter. Rate-limited per-IP via the AUTH preset so credential
 * brute-force traffic cannot exhaust the route.
 *
 * @module @/app/api/marketing/newsletter
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { subscribeSchema } from "@/lib/validation/marketing";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    const input = validateInput(subscribeSchema, await req.json());
    const service = await getMarketingService();
    const subscriber = await service.subscribe({
      email: input.email,
      name: input.name,
      source: input.source ?? "website",
    });

    // Return only the safe fields — strip metadata + status to keep the
    // public contract narrow.
    return apiSuccess({
      email: subscriber.email,
      status: subscriber.status,
      subscribedAt: subscriber.subscribed_at,
    });
  } catch (err) {
    return apiError(err);
  }
}
