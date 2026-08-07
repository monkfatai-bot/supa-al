/**
 * Supa AI — Phase 9 Workspace list + create route.
 *
 * GET  `/api/workspace/workspaces` — list workspaces the caller owns.
 * POST `/api/workspace/workspaces` — create a new workspace owned by the caller.
 *
 * @module @/app/api/workspace/workspaces/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createWorkspaceService } from "@/lib/workspace";
import { validateInput } from "@/lib/validation";
import {
  createWorkspaceSchema,
  listWorkspacesQuerySchema,
} from "@/lib/validation/workspace";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listWorkspacesQuerySchema, {
      search: url.searchParams.get("search") ?? undefined,
      type: url.searchParams.get("type") ?? undefined,
      includeArchived: url.searchParams.get("includeArchived") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createWorkspaceService();
    const workspaces = await service.list(user.id, query);
    return apiSuccess({ workspaces });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createWorkspaceSchema, await req.json());

    const service = await createWorkspaceService();
    const workspace = await service.create(user.id, input);
    return apiSuccess({ workspace });
  } catch (err) {
    return apiError(err);
  }
}
