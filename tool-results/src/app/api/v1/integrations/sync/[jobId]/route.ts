/**
 * Supa AI — Phase 10 Integration Hub — sync job detail + cancel + retry.
 *
 * GET    `/api/v1/integrations/sync/[jobId]`            — fetch single job.
 * POST   `/api/v1/integrations/sync/[jobId]/cancel`     — cancel a pending/running job.
 * POST   `/api/v1/integrations/sync/[jobId]/retry`      — retry a failed job.
 *
 * @module @/app/api/v1/integrations/sync/[jobId]/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getSyncEngine } from "@/lib/integrations";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { jobId } = await ctx.params;
    const engine = getSyncEngine();
    const stats = await engine.getStats({ workspaceId: "" });
    const job = stats.recent.find((j) => j.id === jobId) ?? null;
    if (!job) return apiError(new Error("Sync job not found."), 404);
    return apiSuccess({ job });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { jobId } = await ctx.params;
    const engine = getSyncEngine();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "cancel";
    if (action === "retry") {
      const job = await engine.retryJob(jobId);
      return apiSuccess({ job });
    }
    const job = await engine.cancelJob(jobId);
    return apiSuccess({ job });
  } catch (err) {
    return apiError(err);
  }
}
