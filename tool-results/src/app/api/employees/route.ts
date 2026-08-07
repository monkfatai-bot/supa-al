/**
 * Supa AI — Phase 9C Employees list + create route.
 *
 * GET  `/api/employees`             — paginated list of the caller's
 *                                     workspace employees.
 * POST `/api/employees`             — create a new employee.
 *
 * Workspace resolution: until Phase 9A lands a real `workspaces`
 * table, the caller's `userId` is used as the synthetic workspace id.
 * The service layer accepts any non-empty string and the API layer
 * passes through the resolved value.
 *
 * @module @/app/api/employees/route
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";
import { validateInput } from "@/lib/validation";
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
} from "@/lib/validation/employees";

export async function GET(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const query = validateInput(listEmployeesQuerySchema, {
      search: url.searchParams.get("search") ?? undefined,
      department: url.searchParams.get("department") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      isTemplate: (url.searchParams.get("isTemplate") === "true") as boolean | undefined,
      isPublic: (url.searchParams.get("isPublic") === "true") as boolean | undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      offset: url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : undefined,
    });

    const service = createEmployeeService();
    const employees = await service.list(user.id, query);
    return apiSuccess({ employees });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  try {
    const user = await requireAuth();
    const input = validateInput(createEmployeeSchema, await req.json());

    const service = createEmployeeService();
    const employee = await service.create(user.id, user.id, input);
    return apiSuccess({ employee });
  } catch (err) {
    return apiError(err);
  }
}
