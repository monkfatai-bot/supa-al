/**
 * Supa AI — Phase 9A Automation — dashboard stats route.
 *
 * GET `/api/automation/dashboard?workspaceId=...`  — workspace automation
 *                                              dashboard summary.
 *
 * @module @/app/api/automation/dashboard/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createAutomationService } from "@/lib/automation";
import { resolveWorkspaceId } from "../_helpers";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const workspaceId = resolveWorkspaceId(req);

    const service = createAutomationService();
    const dashboard = await service.getDashboard(workspaceId);
    return apiSuccess({ dashboard });
  } catch (err) {
    return apiError(err);
  }
}
