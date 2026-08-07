/**
 * Supa AI — Phase 10 business dashboard service (server-only).
 *
 * Thin wrapper around {@link ReportService.dashboard} so the dashboard
 * API route can stay narrow + future aggregates (recent activity, charts
 * slices) can land here without touching the report service.
 *
 * @module @/lib/business/dashboard-service
 */
import "server-only";

import { createReportService, ReportService } from "./report-service";
import type { BusinessDashboardStats } from "./types";

export class BusinessDashboardService {
  constructor(private readonly reports: ReportService) {}

  /** Resolve the aggregate dashboard snapshot for a workspace. */
  async stats(
    workspaceId: string,
    userId: string,
  ): Promise<BusinessDashboardStats> {
    return this.reports.dashboard(workspaceId, userId);
  }
}

export async function createBusinessDashboardService(): Promise<BusinessDashboardService> {
  const reports = await createReportService();
  return new BusinessDashboardService(reports);
}
