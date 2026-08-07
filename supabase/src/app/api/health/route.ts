/**
 * Supa AI — Health route.
 *
 * GET `/api/health` — a lightweight liveness + readiness probe that returns
 * 200 OK with a JSON payload describing the running instance:
 *
 *   {
 *     "status": "ok",
 *     "timestamp": "2026-08-04T…",
 *     "environment": "development",
 *     "version": "0.1.0",
 *     "services": {
 *       "supabase": true,
 *       "redis": false,
 *       "aiProviders": 3,
 *       "paymentProviders": 1
 *     }
 *   }
 *
 * Used by container orchestrators (Docker healthcheck, Kubernetes liveness)
 * and by the deployment pipeline's pre-deploy checklist.
 *
 * @module @/app/api/health/route
 */
import { NextResponse } from "next/server";

import { env } from "@/lib/config/env";
import { APP_VERSION } from "@/lib/constants/app";
import { ai } from "@/lib/ai";
import { billing } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const aiProviders = ai.listAvailable();
  const paymentProviders = billing.listAvailableProviders();

  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: env.app.environment,
      version: APP_VERSION,
      services: {
        supabase: Boolean(env.supabase.url && env.supabase.anonKey),
        redis: env.redis.enabled,
        aiProviders: aiProviders.length,
        paymentProviders: paymentProviders.length,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
