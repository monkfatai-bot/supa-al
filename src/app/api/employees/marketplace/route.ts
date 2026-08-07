/**
 * Supa AI — Phase 9C marketplace list route.
 *
 * GET `/api/employees/marketplace` — paginated list of published
 * marketplace entries (public, sorted featured-first then by rating
 * then by install_count). Optionally filter by `category`,
 * `search`, or `featured`.
 *
 * Public read: any authenticated user can browse the marketplace,
 * regardless of workspace membership.
 *
 * @module @/app/api/employees/marketplace/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { validateInput } from "@/lib/validation";
import { listMarketplaceQuerySchema } from "@/lib/validation/employees";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listMarketplaceQuerySchema, {
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      featured: url.searchParams.get("featured") === "true" ? true : undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = createEmployeeService();
    const entries = await service.listMarketplace(query);
    return apiSuccess({ entries });
  } catch (err) {
    return apiError(err);
  }
}
