import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const body = await req.json();
    const service = getRuntimeService();
    const schedule = await service.updateSchedule(workspaceId, user.id, id, body);
    return apiSuccess({ schedule });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const service = getRuntimeService();
    await service.deleteSchedule(workspaceId, user.id, id);
    return apiSuccess({ deleted: true });
  } catch (err) {
    return apiError(err);
  }
}
