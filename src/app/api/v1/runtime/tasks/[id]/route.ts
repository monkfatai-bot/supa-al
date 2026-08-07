import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const service = getRuntimeService();
    const task = await service.getTask(workspaceId, user.id, id);
    return apiSuccess({ task });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const body = await req.json();
    const service = getRuntimeService();
    if (body.action === "cancel") {
      await service.cancelTask(workspaceId, user.id, id);
      return apiSuccess({ cancelled: true });
    }
    if (body.action === "retry") {
      const task = await service.retryTask(workspaceId, user.id, id);
      return apiSuccess({ task });
    }
    throw new ValidationError("Unknown action. Use 'cancel' or 'retry'.");
  } catch (err) {
    return apiError(err);
  }
}
