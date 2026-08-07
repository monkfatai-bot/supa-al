/**
 * Supa AI — Phase 10 products list + create route.
 *
 * @module @/app/api/business/products/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createProductService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createProductSchema,
  listProductsQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listProductsQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      isActive: url.searchParams.get("isActive") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createProductService();
    const products = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ products });
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
    const input = validateInput(createProductSchema, body);

    const service = await createProductService();
    const product = await service.create(workspaceId, user.id, input);
    return apiSuccess({ product });
  } catch (err) {
    return apiError(err);
  }
}
