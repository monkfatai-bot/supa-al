/**
 * Supa AI — Phase 9C employee memory search route.
 *
 * GET `/api/employees/:id/memory/search?q=...&limit=...` — search
 * memory entries by key (ILIKE). Returns at most `limit` rows.
 *
 * @module @/app/api/employees/[id]/memory/search/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { searchMemoryQuerySchema } from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const url = new URL(req.url);
    const query = validateInput(searchMemoryQuerySchema, {
      q: url.searchParams.get("q") ?? "",
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const service = createEmployeeService();
    const memory = await service.searchMemory(id, query.q, query.limit);
    return apiSuccess({ memory });
  } catch (err) {
    return apiError(err);
  }
}
