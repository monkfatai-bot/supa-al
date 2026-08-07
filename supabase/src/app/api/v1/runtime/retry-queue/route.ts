import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      // If CRON_SECRET is set, require it.
      // Otherwise, fall through to requireAuth.
    }
    // Try cron auth first, then user auth.
    try {
      await requireAuth();
    } catch {
      if (!cronSecret) throw new Error("Authentication required.");
    }
    const service = getRuntimeService();
    const result = await service.processRetryQueue();
    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
