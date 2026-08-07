import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { ValidationError } from "@/lib/errors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const days = url.searchParams.get("days") ? Number(url.searchParams.get("days")) : 30;
    const service = getRuntimeService();
    const metrics = await service.getMetrics(workspaceId, user.id, { days });
    return apiSuccess({ metrics });
  } catch (err) {
    return apiError(err);
  }
}
