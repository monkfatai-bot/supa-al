/**
 * Supa AI — Phase 10 Integration Hub — webhook retry-queue processor.
 *
 * POST `/api/v1/integrations/webhooks/retry-queue?cronSecret=...`
 *
 * Public (cron-only) — protected by `CRON_SECRET` query param check.
 *
 * @module @/app/api/v1/integrations/webhooks/retry-queue/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { env } from "@/lib/config/env";
import { getWebhookManager } from "@/lib/integrations";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("cronSecret") ?? "";
    if (!env.security.cronSecret || secret !== env.security.cronSecret) {
      return apiError(new Error("Unauthorized."), 401);
    }
    const mgr = getWebhookManager();
    const processed = await mgr.processRetryQueue();
    return apiSuccess({ processed });
  } catch (err) {
    return apiError(err);
  }
}
