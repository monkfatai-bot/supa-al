/**
 * Supa AI — Phase 10 receipts list + create route.
 *
 * @module @/app/api/business/receipts/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createReceiptService } from "@/lib/business";
import { validateInput } from "@/lib/validation";
import {
  createReceiptSchema,
  listReceiptsQuerySchema,
} from "@/lib/validation/business";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listReceiptsQuerySchema, {
      workspaceId: url.searchParams.get("workspaceId") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
      invoiceId: url.searchParams.get("invoiceId") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });
    const service = await createReceiptService();
    const receipts = await service.list(query.workspaceId, user.id, query);
    return apiSuccess({ receipts });
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
    const input = validateInput(createReceiptSchema, body);

    const service = await createReceiptService();
    const receipt = await service.create(workspaceId, user.id, input);
    return apiSuccess({ receipt });
  } catch (err) {
    return apiError(err);
  }
}
