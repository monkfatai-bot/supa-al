/**
 * Supa AI — Phase 10 suppliers list + create route.
 *
 * @module @/app/api/business/suppliers/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createSupplierService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createSupplierSchema,
  listSuppliersQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listSuppliersQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createSupplierService();
    const suppliers = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ suppliers });
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
    const input = validateInput(createSupplierSchema, body);

    const service = await createSupplierService();
    const supplier = await service.create(workspaceId, user.id, input);
    return apiSuccess({ supplier });
  } catch (err) {
    return apiError(err);
  }
}
