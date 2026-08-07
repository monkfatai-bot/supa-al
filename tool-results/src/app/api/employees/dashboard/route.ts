/**
 * Supa AI — Phase 9C employee manager dashboard route.
 *
 * GET `/api/employees/dashboard` — aggregate manager-dashboard
 * summary for the caller's workspace:
 *   - totalEmployees / active / paused / archived counts
 *   - totalTasks / totalFailedTasks / avgSuccessRate (last 30 days)
 *   - totalCreditsConsumed / totalCostCents / totalTokens
 *   - byDepartment breakdown (count, active, tasks, avg success, credits)
 *   - topPerformers (top 5 by tasksCompleted × successRate)
 *
 * @module @/app/api/employees/dashboard/route
 */
import { NextResponse } from "next/server";

import { apiError, apiSuccess, requireAuth } from "@/lib/auth/api-helpers";
import { createEmployeeService } from "@/lib/employees";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireAuth();

    const service = createEmployeeService();
    const dashboard = await service.getDashboard(user.id);
    return apiSuccess({ dashboard });
  } catch (err) {
    return apiError(err);
  }
}
