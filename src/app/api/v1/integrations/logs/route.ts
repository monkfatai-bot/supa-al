import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { getIntegrationLogs } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid().optional(),
  action: z.string().optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

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

    const { workspaceId, accountId, action, direction, limit, offset } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await getIntegrationLogs({
      workspaceId,
      accountId,
      action,
      direction,
      limit,
      offset,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/logs error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
