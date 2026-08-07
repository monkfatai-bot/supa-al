/**
 * Supa AI — Phase 10 customers list + create route.
 *
 * GET  `/api/business/customers?workspaceId=...` — list customers.
 * POST `/api/business/customers`                   — create a customer
 *                                                     (body must include
 *                                                     `workspaceId`).
 *
 * @module @/app/api/business/customers/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createCustomerService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
} from "@/lib/validation/business";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listCustomersQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      customerType: url.searchParams.get("customerType") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = await createCustomerService();
    const customers = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ customers });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = String(body.workspaceId ?? "");
    if (!workspaceId) {
      return apiError(new Error("workspaceId is required."), 400);
    }
    const input = validateInput(createCustomerSchema, body);

    const service = await createCustomerService();
    const customer = await service.create(workspaceId, user.id, input);
    return apiSuccess({ customer });
  } catch (err) {
    return apiError(err);
  }
}
