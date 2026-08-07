import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Cron call — proceed.
    } else {
      await requireAuth();
    }
    const service = getRuntimeService();
    const result = await service.processScheduledItems();
    return apiSuccess(result);
  } catch (err) {
    return apiError(err);
  }
}
