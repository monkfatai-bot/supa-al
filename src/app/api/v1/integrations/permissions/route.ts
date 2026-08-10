import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRequest, ApiAuthError } from "../_lib/auth";
import { getIntegrationPermissions, updateIntegrationPermissions } from "@/services/integration-hub/actions";
import { logger } from "@/services/logger";
import type { Json } from "@/types/generated/database";

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().uuid().optional(),
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

    const { workspaceId, integrationId } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await getIntegrationPermissions(workspaceId, integrationId ?? "");
    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/permissions GET error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

const updatePermissionsSchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().uuid(),
  permissions: z.record(z.string(), z.boolean()),
});

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    const body = await request.json();
    const parsed = updatePermissionsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed.", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { workspaceId, integrationId, permissions } = parsed.data;

    if (auth.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Workspace mismatch." }, { status: 403 });
    }

    const result = await updateIntegrationPermissions(
      workspaceId,
      integrationId,
      permissions as unknown as Json
    );

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error("v1/integrations/permissions PUT error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
