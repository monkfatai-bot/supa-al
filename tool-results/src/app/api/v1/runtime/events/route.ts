import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError, apiSuccess, requireAuth, requirePermission } from "@/lib/auth/api-helpers";
import { getRuntimeService } from "@/lib/runtime";
import { validateInput } from "@/lib/validation";
import { listEventsQuerySchema } from "@/lib/validation/runtime";
import { ValidationError } from "@/lib/errors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    requirePermission(user, "integration:read");
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId") ?? "";
    if (!workspaceId) throw new ValidationError("workspaceId is required");
    const query = validateInput(listEventsQuerySchema, {
      session_id: url.searchParams.get("session_id") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      level: url.searchParams.get("level") ?? undefined,
      event_type: url.searchParams.get("event_type") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const service = getRuntimeService();
    const events = await service.listEvents(workspaceId, user.id, query);
    return apiSuccess({ events });
  } catch (err) {
    return apiError(err);
  }
}
