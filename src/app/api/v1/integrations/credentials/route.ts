import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { listConnectedAccounts, refreshIntegrationToken } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId || auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Invalid workspaceId." }, { status: 400 });
    }

    const result = await listConnectedAccounts(workspaceId);
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/credentials GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

const refreshSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, accountId } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await refreshIntegrationToken(accountId, workspaceId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Token refresh failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Token refreshed." });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/credentials POST error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
