/**
 * Supa AI — Phase 10 Integration Hub — sync jobs list + create.
 *
 * GET  `/api/v1/integrations/sync?workspaceId=...`
 * POST `/api/v1/integrations/sync`
 *
 * @module @/app/api/v1/integrations/sync/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { getSyncEngine } from "@/lib/integrations";
import { validateInput } from "@/lib/validation";
import {
  createSyncJobSchema,
  listSyncJobsQuerySchema,
} from "@/lib/validation/integrations";
import { parseJsonBody, resolveWorkspaceId } from "../_helpers";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const query = validateInput(listSyncJobsQuerySchema, {
      integrationId: url.searchParams.get("integrationId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const engine = getSyncEngine();
    const jobs = await engine.listJobs({ workspaceId, ...query });
    return apiSuccess({ jobs });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(createSyncJobSchema, body);
    const engine = getSyncEngine();
    const job = await engine.createJob({ workspaceId, userId: user.id, data: input });
    return apiSuccess({ job });
  } catch (err) {
    return apiError(err);
  }
}
