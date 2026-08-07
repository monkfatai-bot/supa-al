import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { validateInput } from "@/lib/validation";
import { createProcessSchema, listProcessesQuerySchema } from "@/lib/validation/runtime";
import { ValidationError } from "@/lib/errors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const query = validateInput(listProcessesQuerySchema, {
      session_id: url.searchParams.get("session_id") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      process_type: url.searchParams.get("process_type") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const service = getRuntimeService();
    const processes = await service.listProcesses(workspaceId, user.id, query);
    return apiSuccess({ processes });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:manage");
    const input = validateInput(createProcessSchema, await req.json());
    const service = getRuntimeService();
    const process = await service.createProcess(user.id, input);
    return apiSuccess({ process });
  } catch (err) {
    return apiError(err);
  }
}
