import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { ValidationError } from "@/lib/errors";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const body = await req.json();
    const workspaceId = body.workspace_id;
    const sessionId = body.session_id;
    if (!workspaceId || !sessionId) throw new ValidationError("workspace_id and session_id are required");
    const service = getRuntimeService();
    const recovery = await service.createCheckpoint(workspaceId, user.id, sessionId);
    return apiSuccess({ recovery });
  } catch (err) {
    return apiError(err);
  }
}
