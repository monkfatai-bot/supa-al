import type { Json } from "@/types/generated/database";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { connectIntegration } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";

const connectSchema = z.object({
  integrationId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  displayName: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { integrationId, workspaceId, config, displayName } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "Workspace mismatch." },
        { status: 403 }
      );
    }

    const result = await connectIntegration({
      integrationId,
      workspaceId,
      config: config as Json,
      displayName,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Connection failed." },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/connect error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
