/**
 * Supa AI — Phase 10 Integration Hub — sync retry queue processor.
 *
 * POST `/api/v1/integrations/sync/retry-queue?cronSecret=...` — process due retries.
 *
 * Public (cron-only) — protected by `CRON_SECRET` query param check.
 *
 * @module @/app/api/v1/integrations/sync/retry-queue/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess } from "@/lib/auth/api-helpers";
import { env } from "@/lib/config/env";
import { getSyncEngine } from "@/lib/integrations";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("cronSecret") ?? "";
    if (!env.security.cronSecret || secret !== env.security.cronSecret) {
      return apiError(new Error("Unauthorized."), 401);
    }
    const engine = getSyncEngine();
    const processed = await engine.processRetryQueue();
    return apiSuccess({ processed });
  } catch (err) {
    return apiError(err);
  }
}
