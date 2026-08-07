/**
 * Supa AI — Phase 9A Automation — workflows list + create route.
 *
 * GET  `/api/automation/workflows?workspaceId=...` — paginated list of
 *                                              the caller's workflows.
 * POST `/api/automation/workflows`                — create a new workflow.
 *
 * @module @/app/api/automation/workflows/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { validateInput } from "@/lib/validation";
import {
  createWorkflowSchema,
  listWorkflowsQuerySchema,
} from "@/lib/validation/automation";
import { parseJsonBody, resolveWorkspaceId } from "../_helpers";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const url = new URL(req.url);
    const query = validateInput(listWorkflowsQuerySchema, {
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      isTemplate: url.searchParams.get("isTemplate") ?? undefined,
      templateCategory: url.searchParams.get("templateCategory") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = createAutomationService();
    const workflows = await service.listWorkflows(workspaceId, query);
    return apiSuccess({ workflows });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const workspaceId = resolveWorkspaceId(req);
    const body = await parseJsonBody(req);
    const input = validateInput(createWorkflowSchema, body);

    const service = createAutomationService();
    const workflow = await service.createWorkflow(workspaceId, user.id, input);
    return apiSuccess({ workflow });
  } catch (err) {
    return apiError(err);
  }
}
