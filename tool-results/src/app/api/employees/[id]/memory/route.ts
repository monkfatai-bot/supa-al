/**
 * Supa AI — Phase 9C employee memory list + add route.
 *
 * GET  `/api/employees/:id/memory`  — list memory entries for an
 *                                     employee (optionally filter by
 *                                     type, hide expired session mem).
 * POST `/api/employees/:id/memory`  — add a new memory entry.
 *
 * @module @/app/api/employees/[id]/memory/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { NotFoundError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  addMemorySchema,
  listMemoryQuerySchema,
} from "@/lib/validation/employees";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const url = new URL(req.url);
    const query = validateInput(listMemoryQuerySchema, {
      type: url.searchParams.get("type") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const service = createEmployeeService();
    const memory = await service.listMemory(id, query);
    return apiSuccess({ memory });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: RouteContext,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const { id } = await ctx.params;
    if (!id) throw new NotFoundError("Employee");

    const input = validateInput(addMemorySchema, await req.json());

    const service = createEmployeeService();
    const memory = await service.addMemory(id, user.id, input);
    return apiSuccess({ memory });
  } catch (err) {
    return apiError(err);
  }
}
