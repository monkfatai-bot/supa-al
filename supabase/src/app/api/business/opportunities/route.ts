/**
 * Supa AI — Phase 10 opportunities list + create route.
 *
 * @module @/app/api/business/opportunities/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createOpportunityService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createOpportunitySchema,
  listOpportunitiesQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listOpportunitiesQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      stage: url.searchParams.get("stage") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      assignedTo: url.searchParams.get("assignedTo") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createOpportunityService();
    const opportunities = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ opportunities });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId ?? "");
    if (!workspaceId) return apiError(new Error("workspaceId is required."), 400);
    const input = validateInput(createOpportunitySchema, body);

    const service = await createOpportunityService();
    const opportunity = await service.create(workspaceId, user.id, input);
    return apiSuccess({ opportunity });
  } catch (err) {
    return apiError(err);
  }
}
