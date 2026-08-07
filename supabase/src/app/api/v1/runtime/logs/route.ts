import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { validateInput } from "@/lib/validation";
import { listLogsQuerySchema } from "@/lib/validation/runtime";
import { ValidationError } from "@/lib/errors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const query = validateInput(listLogsQuerySchema, {
      session_id: url.searchParams.get("session_id") ?? undefined,
      level: url.searchParams.get("level") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const service = getRuntimeService();
    const logs = await service.listLogs(workspaceId, user.id, query);
    return apiSuccess({ logs });
  } catch (err) {
    return apiError(err);
  }
}
