/**
 * Supa AI — Phase 10 expenses list + create route.
 *
 * @module @/app/api/business/expenses/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createExpenseService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createExpenseSchema,
  listExpensesQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listExpensesQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createExpenseService();
    const expenses = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ expenses });
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
    const input = validateInput(createExpenseSchema, body);

    const service = await createExpenseService();
    const expense = await service.create(workspaceId, user.id, input);
    return apiSuccess({ expense });
  } catch (err) {
    return apiError(err);
  }
}
