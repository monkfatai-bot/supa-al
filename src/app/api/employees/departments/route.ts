/**
 * Supa AI — Phase 9C departments list route.
 *
 * GET `/api/employees/departments` — list departments available to
 * the caller's workspace. Includes the seeded global departments
 * (`workspace_id IS NULL`) plus any workspace-specific overrides.
 *
 * @module @/app/api/employees/departments/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const service = createEmployeeService();
    const departments = await service.listDepartments(user.id);
    return apiSuccess({ departments });
  } catch (err) {
    return apiError(err);
  }
}
