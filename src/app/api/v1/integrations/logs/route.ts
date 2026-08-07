/**
 * Supa AI — Phase 10 Integration Hub — logs list + create.
 *
 * GET  `/api/v1/integrations/logs?workspaceId=...`  — list logs.
 * POST `/api/v1/integrations/logs`                  — append a log entry.
 *
 * @module @/app/api/v1/integrations/logs/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getIntegrationService } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import {
  listLogsQuerySchema,
  logEntrySchema,
} from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const options = validateInput(listLogsQuerySchema, {
      integrationId: url.searchParams.get("integrationId") ?? undefined,
      level: url.searchParams.get("level") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = getIntegrationService();
    const logs = await service.listLogs({ workspaceId, options });
    return apiSuccess({ logs });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(logEntrySchema, body);
    const service = getIntegrationService();
    const log = await service.log({ workspaceId, data: input });
    return apiSuccess({ log });
  } catch (err) {
    return apiError(err);
  }
}
