/**
 * Reports & Analytics service types.
 */

/** Supported report types. */
export type ReportType =
  | "sales"
  | "revenue"
  | "expense"
  | "customer"
  | "inventory"
  | "project"
  | "ai_usage"
  | "financial";

/** Supported export formats. */
export type ReportFormat = "json" | "pdf" | "csv" | "xlsx";

/** Incoming request for report generation. */
export interface GenerateReportRequest {
  workspaceId: string;
  reportType: ReportType;
  format: ReportFormat;
  periodStart?: string;
  periodEnd?: string;
  filters?: Record<string, unknown>;
}

/** Standardised report envelope returned by every generator. */
export interface ReportData {
  title: string;
  generatedAt: string;
  periodStart?: string;
  periodEnd?: string;
  data: Record<string, unknown>;
}

/** Structured sales report data. */
export interface SalesReport {
  totalRevenue: number;
  invoiceCount: number;
  avgInvoiceValue: number;
  topCustomers: { name: string; revenue: number }[];
  revenueByMonth: { month: string; revenue: number }[];
}

/** Structured customer report data. */
export interface CustomerReport {
  totalCustomers: number;
  newThisMonth: number;
  topByRevenue: { name: string; revenue: number; invoiceCount: number }[];
  byStatus: { status: string; count: number }[];
}
