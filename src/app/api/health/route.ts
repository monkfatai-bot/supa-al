import { NextResponse } from "next/server";
import { APP_CONFIG } from "@/config/app";
import { createAdminClient } from "@/lib/supabase/admin-client";

export async function GET() {
  const start = Date.now();
  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    const admin = createAdminClient();
    const dbStart = Date.now();
    const { error } = await admin.from("profiles").select("id").limit(1);
    dbLatencyMs = Date.now() - dbStart;
    if (error) {
      dbStatus = "error";
      dbError = error.message;
    }
  } catch (err) {
    dbStatus = "error";
    dbError = err instanceof Error ? err.message : "Unknown error";
  }

  const totalLatencyMs = Date.now() - start;
  const isHealthy = dbStatus === "ok";

  return NextResponse.json(
    {
      status: isHealthy ? "ok" : "degraded",
      name: APP_CONFIG.name,
      version: APP_CONFIG.version,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: dbStatus,
          latency_ms: dbLatencyMs,
          error: dbError,
        },
      },
      latency_ms: totalLatencyMs,
    },
    { status: isHealthy ? 200 : 503 },
  );
}
