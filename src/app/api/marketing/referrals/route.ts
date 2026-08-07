/**
 * Supa AI — GET + POST /api/marketing/referrals
 *
 * GET  ?code=<referral-code>  → resolve a referral by code (public).
 * POST { referrerEmail, referredEmail?, source? }  → create a new referral.
 *
 * Both are rate-limited per-IP via the AUTH preset. The POST response is
 * intentionally narrow — only the referral code + status are surfaced
 * (never the referrer's user id or PII).
 *
 * @module @/app/api/marketing/referrals
 */
import type { NextRequest } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { getClientIp } from "@/lib/auth/helpers";
import { getMarketingService } from "@/lib/marketing";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { validateInput } from "@/lib/validation";
import { referralCodeSchema, createReferralSchema } from "@/lib/validation/marketing";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.API);

    const url = new URL(req.url);
    const rawCode = url.searchParams.get("code");
    const code = validateInput(referralCodeSchema, rawCode ?? "");

    const service = await getMarketingService();
    const referral = await service.getReferralByCode(code);

    // Public shape: only the code + status (no referrer email or user id).
    return apiSuccess({
      referralCode: referral.referral_code,
      status: referral.status,
      rewardType: referral.reward_type,
      rewardAmount: referral.reward_amount,
      createdAt: referral.created_at,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    await rateLimiter.consumePreset(ip, RATE_LIMIT_PRESETS.AUTH);

    const input = validateInput(createReferralSchema, await req.json());
    const service = await getMarketingService();
    const referral = await service.createReferral({
      referrerEmail: input.referrerEmail,
      referredEmail: input.referredEmail,
      source: input.source,
    });

    return apiSuccess({
      referralCode: referral.referral_code,
      status: referral.status,
      createdAt: referral.created_at,
    });
  } catch (err) {
    return apiError(err);
  }
}
