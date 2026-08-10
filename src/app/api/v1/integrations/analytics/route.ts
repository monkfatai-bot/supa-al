import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { getUsageAnalytics } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  period: z.enum(["7d", "30d", "90d"]).optional().default("30d"),
});

function periodToDateRange(period: string) {
  const now = new Date();
  const start = new Date();
  switch (period) {
    case "7d":
      start.setDate(now.getDate() - 7);
      break;
    case "90d":
      start.setDate(now.getDate() - 90);
      break;
    case "30d":
    default:
      start.setDate(now.getDate() - 30);
      break;
  }
  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, period } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const { startDate, endDate } = periodToDateRange(period);
    const result = await getUsageAnalytics({ workspaceId, startDate, endDate });
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/analytics error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
