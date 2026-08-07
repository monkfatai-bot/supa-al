/**
 * Supa AI — POST /api/marketing/demo-requests
 *
 * Public endpoint for prospective customers to request a product demo.
 * Rate-limited per-IP via the AUTH preset; triggers a best-effort CRM sync
 * inside the service layer.
 *
 * @module @/app/api/marketing/demo-requests
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { createDemoRequestSchema } from "@/lib/validation/marketing";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    const input = validateInput(createDemoRequestSchema, await req.json());
    const service = await getMarketingService();
    const demoRequest = await service.createDemoRequest({
      name: input.name,
      email: input.email,
      company: input.company,
      phone: input.phone,
      teamSize: input.teamSize,
      useCase: input.useCase,
      message: input.message,
    });

    // Return only the safe identifier — never the row's metadata.
    return apiSuccess({
      id: demoRequest.id,
      status: demoRequest.status,
      requestedAt: demoRequest.requested_at,
    });
  } catch (err) {
    return apiError(err);
  }
}
