/**
 * Supa AI — POST /api/marketing/contact
 *
 * Public contact-form endpoint. Persists the message + the trusted
 * server-side metadata (IP, user agent). Rate-limited per-IP.
 *
 * @module @/app/api/marketing/contact
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { createContactMessageSchema } from "@/lib/validation/marketing";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    const input = validateInput(createContactMessageSchema, await req.json());
    const service = await getMarketingService();

    const userAgent = req.headers.get("user-agent");
    const message = await service.createContactMessage(
      {
        name: input.name,
        email: input.email,
        subject: input.subject,
        message: input.message,
        category: input.category,
      },
      {
        ipAddress: ip,
        userAgent: userAgent ?? null,
      },
    );

    return apiSuccess({
      id: message.id,
      status: message.status,
      createdAt: message.created_at,
    });
  } catch (err) {
    return apiError(err);
  }
}
