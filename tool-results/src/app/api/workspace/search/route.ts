/**
 * Supa AI — Phase 9 global workspace search route.
 *
 * GET `/api/workspace/search?q=...&workspaceId=...` — federated search
 *     across documents, knowledge_base, file_library, and folders.
 *
 * @module @/app/api/workspace/search/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createSearchService } from "@/lib/workspace";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { workspaceSearchQuerySchema } from "@/lib/validation/workspace";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) throw new NotFoundError("Workspace");

    const query = validateInput(workspaceSearchQuerySchema, {
      q: url.searchParams.get("q") ?? undefined,
      kinds: url.searchParams.getAll("kinds"),
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });

    const service = await createSearchService();
    const results = await service.search(workspaceId, user.id, {
      query: query.q,
      kinds: query.kinds,
      limit: query.limit,
    });
    return apiSuccess({ results });
  } catch (err) {
    return apiError(err);
  }
}
