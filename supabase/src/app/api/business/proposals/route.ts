/**
 * Supa AI — Phase 10 proposals list + create route.
 *
 * @module @/app/api/business/proposals/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createProposalService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createProposalSchema,
  listProposalsQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listProposalsQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createProposalService();
    const proposals = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ proposals });
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
    const input = validateInput(createProposalSchema, body);

    const service = await createProposalService();
    const proposal = await service.create(workspaceId, user.id, input);
    return apiSuccess({ proposal });
  } catch (err) {
    return apiError(err);
  }
}
