/**
 * Supa AI — Phase 9B Builder — node definitions catalog.
 *
 * GET `/api/builder/node-definitions?category=…`
 *      — list every node definition in the catalog (all 71). Optional
 *        `category` query param filters to a single category.
 *
 * Auth: required. The catalog itself is public info but the endpoint is
 * behind auth so anonymous bots can't scrape it.
 *
 * @module @/app/api/builder/node-definitions/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createBuilderService } from "@/lib/builder";
import { nodeRegistry } from "@/lib/builder/node-definitions";
import type { NodeType } from "@/lib/builder/client";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const category = url.searchParams.get("category") ?? "";

    const service = await createBuilderService();
    let nodes = service.getNodeDefinitions();
    if (category) {
      nodes = nodeRegistry.listByCategory(category as NodeType);
    }
    return apiSuccess({ nodes, version: 1 });
  } catch (err) {
    return apiError(err);
  }
}
