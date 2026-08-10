import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { logger } from "@/services/logger";

const syncSchema = z.object({
  integrationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  syncType: z.enum(["full", "incremental"]).optional().default("incremental"),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { integrationId, workspaceId } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    // Dynamic import to avoid hard dependency on sync engine
    const { runSyncNow } = await import("@/services/sync-engine/actions");
    const result = await runSyncNow(workspaceId, integrationId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Sync failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: result.data }, { status: 202 });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/sync error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
