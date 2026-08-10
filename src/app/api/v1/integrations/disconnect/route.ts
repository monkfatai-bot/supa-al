import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { disconnectIntegration } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";

const disconnectSchema = z.object({
  accountId: z.string().uuid(),
  workspaceId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = disconnectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { accountId, workspaceId } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await disconnectIntegration(accountId, workspaceId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Disconnect failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/disconnect error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
