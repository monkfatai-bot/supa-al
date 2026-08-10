"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { requireMinimumRole } from "@/lib/workspace-utils";
import { PAGINATION } from "@/config/constants";
import { getFinancialDashboard } from "@/services/accounting/actions";
import type {
  GenerateReportRequest,
  ReportData,
  SalesReport,
  CustomerReport,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
}

/**
 * Converts a flat object array to CSV. Nested objects are stringified.
 * Handles booleans, numbers, null, and strings with commas/quotes.
 */
function arrayToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";

  const allKeys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      allKeys.add(key);
    }
  }

  const headers = Array.from(allKeys);
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(csvEscape).join(","));

  // Data rows
  for (const row of rows) {
    const values = headers.map((key) => {
      const val = row[key];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return csvEscape(JSON.stringify(val));
      return csvEscape(String(val));
    });
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Convert report data to CSV string.
 * Flattens the nested data object into rows for CSV output.
 */
export async function exportReportToCsv(reportData: ReportData): Promise<ExportResult> {
  const { data, title } = reportData;

  // Flatten the data into a list of row objects
  const rows: Record<string, unknown>[] = [];

  // Try to find array data within the report
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          rows.push(item as Record<string, unknown>);
        } else {
          rows.push({ key, value: item });
        }
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (Array.isArray(subValue)) {
          for (const item of subValue) {
            if (typeof item === "object" && item !== null) {
              rows.push({ section: key, ...(item as Record<string, unknown>) });
            } else {
              rows.push({ section: key, [subKey]: item });
            }
          }
        } else {
          rows.push({ section: key, [subKey]: subValue });
        }
      }
    } else {
      rows.push({ key, value });
    }
  }

  const content = arrayToCsv(rows);
  const filename = `${title.replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().split("T")[0]}.csv`;

  return { content, filename, mimeType: "text/csv" };
}

// ---------------------------------------------------------------------------
// PDF Export (placeholder)
// ---------------------------------------------------------------------------

/**
 * Export report data as a printable HTML table.
 * Browsers can print the returned HTML to PDF via Ctrl+P.
 */
export async function exportReportToPdf(reportData: ReportData): Promise<ExportResult> {
  const { title, generatedAt, data } = reportData;
  const entries = Object.entries(data);
  const headerRow = '<tr><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold;text-align:left;">Metric</th><th style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold;text-align:left;">Value</th></tr>';
  const htmlTable = entries.map(([key, value]) =>
    '<tr><td style="padding:8px;border:1px solid #ddd;">' + key + '</td><td style="padding:8px;border:1px solid #ddd;">' + String(value ?? '') + '</td></tr>'
  ).join('');
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title><style>body{font-family:system-ui,sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-top:16px;}</style></head><body><h1>' + title + '</h1><p>Generated: ' + generatedAt + '</p><table>' + headerRow + htmlTable + '</table></body></html>';
  const filename = title.replace(/\s+/g, '_').toLowerCase() + '_' + new Date().toISOString().split('T')[0] + '.html';
  return { content: html, filename, mimeType: 'text/html' };
}

// ---------------------------------------------------------------------------
// Report Generators
// ---------------------------------------------------------------------------

/**
 * Get a comprehensive sales report from invoices.
 */
export async function getSalesReport(
  workspaceId: string,
  options?: { periodStart?: string; periodEnd?: string },
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  let query = supabase
    .from("invoices")
    .select("*, customers!inner(name)")
    .eq("workspace_id", workspaceId);

  if (options?.periodStart) {
    query = query.gte("issue_date", options.periodStart);
  }
  if (options?.periodEnd) {
    query = query.lte("issue_date", options.periodEnd);
  }

  const { data: invoices, error } = await query
    .order("issue_date", { ascending: true })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getSalesReport failed", { reason: error.message });
    throw new Error("Failed to fetch invoice data for sales report.");
  }

  const allInvoices = invoices ?? [];

  // Total revenue & count
  const totalRevenue = allInvoices.reduce((s, i) => s + i.total, 0);
  const invoiceCount = allInvoices.length;
  const avgInvoiceValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;

  // Revenue by customer
  const customerRevenue = new Map<string, number>();
  for (const inv of allInvoices) {
    const customer = inv.customers as unknown as { name: string } | null;
    const name = customer?.name ?? "Unknown";
    customerRevenue.set(name, (customerRevenue.get(name) ?? 0) + inv.total);
  }

  const topCustomers = Array.from(customerRevenue.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  // Revenue by month
  const monthlyRevenue = new Map<string, number>();
  for (const inv of allInvoices) {
    const month = inv.issue_date.substring(0, 7);
    monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + inv.total);
  }

  const revenueByMonth = Array.from(monthlyRevenue.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  // Status breakdown
  const byStatus = new Map<string, number>();
  for (const inv of allInvoices) {
    byStatus.set(inv.status, (byStatus.get(inv.status) ?? 0) + 1);
  }

  // Revenue by status
  const revenueByStatus = new Map<string, number>();
  for (const inv of allInvoices) {
    revenueByStatus.set(inv.status, (revenueByStatus.get(inv.status) ?? 0) + inv.total);
  }

  // Collection rate
  const totalPaid = allInvoices.reduce((s, i) => s + i.amount_paid, 0);
  const collectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;

  const salesReport: SalesReport = {
    totalRevenue,
    invoiceCount,
    avgInvoiceValue,
    topCustomers,
    revenueByMonth,
  };

  return {
    title: "Sales Report",
    generatedAt: new Date().toISOString(),
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    data: {
      salesReport,
      statusBreakdown: Object.fromEntries(byStatus),
      revenueByStatus: Object.fromEntries(
        Array.from(revenueByStatus.entries()).map(([k, v]) => [k, v.toFixed(2)]),
      ),
      totalPaid,
      outstandingAmount: totalRevenue - totalPaid,
      collectionRate: `${collectionRate.toFixed(1)}%`,
    },
  };
}

/**
 * Get a revenue report from income transactions grouped by month & account.
 */
export async function getRevenueReport(
  workspaceId: string,
  options?: { periodStart?: string; periodEnd?: string },
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  let query = supabase
    .from("transactions")
    .select("*, accounts!inner(id, name, account_type)")
    .eq("workspace_id", workspaceId)
    .eq("transaction_type", "income");

  if (options?.periodStart) {
    query = query.gte("transaction_date", options.periodStart);
  }
  if (options?.periodEnd) {
    query = query.lte("transaction_date", options.periodEnd);
  }

  const { data: transactions, error } = await query
    .order("transaction_date", { ascending: true })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getRevenueReport failed", { reason: error.message });
    throw new Error("Failed to fetch transaction data for revenue report.");
  }

  const allTx = transactions ?? [];
  const totalRevenue = allTx.reduce((s, t) => s + t.amount, 0);

  // Revenue by month
  const monthlyRevenue = new Map<string, number>();
  for (const tx of allTx) {
    const month = tx.transaction_date.substring(0, 7);
    monthlyRevenue.set(month, (monthlyRevenue.get(month) ?? 0) + tx.amount);
  }

  // Revenue by account
  const byAccount = new Map<string, number>();
  for (const tx of allTx) {
    const acct = tx.accounts as unknown as { name: string } | null;
    const name = acct?.name ?? "Unknown Account";
    byAccount.set(name, (byAccount.get(name) ?? 0) + tx.amount);
  }

  return {
    title: "Revenue Report",
    generatedAt: new Date().toISOString(),
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    data: {
      totalRevenue,
      transactionCount: allTx.length,
      avgTransactionValue: allTx.length > 0 ? totalRevenue / allTx.length : 0,
      revenueByMonth: Array.from(monthlyRevenue.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue })),
      revenueByAccount: Array.from(byAccount.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([account, total]) => ({ account, total })),
      transactions: allTx.slice(0, 100),
    },
  };
}

/**
 * Get an expense report from the expenses table.
 */
export async function getExpenseReport(
  workspaceId: string,
  options?: { periodStart?: string; periodEnd?: string },
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  let query = supabase
    .from("expenses")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (options?.periodStart) {
    query = query.gte("expense_date", options.periodStart);
  }
  if (options?.periodEnd) {
    query = query.lte("expense_date", options.periodEnd);
  }

  const { data: expenses, error } = await query
    .order("expense_date", { ascending: true })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getExpenseReport failed", { reason: error.message });
    throw new Error("Failed to fetch expense data.");
  }

  const allExpenses = expenses ?? [];
  const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0);

  // By category
  const byCategory = new Map<string, { amount: number; count: number }>();
  for (const exp of allExpenses) {
    const existing = byCategory.get(exp.category) ?? { amount: 0, count: 0 };
    existing.amount += exp.amount;
    existing.count += 1;
    byCategory.set(exp.category, existing);
  }

  // By vendor
  const byVendor = new Map<string, { amount: number; count: number }>();
  for (const exp of allExpenses) {
    const existing = byVendor.get(exp.vendor) ?? { amount: 0, count: 0 };
    existing.amount += exp.amount;
    existing.count += 1;
    byVendor.set(exp.vendor, existing);
  }

  // By month
  const monthlyExpenses = new Map<string, number>();
  for (const exp of allExpenses) {
    const month = exp.expense_date.substring(0, 7);
    monthlyExpenses.set(month, (monthlyExpenses.get(month) ?? 0) + exp.amount);
  }

  // By status
  const byStatus = new Map<string, number>();
  for (const exp of allExpenses) {
    byStatus.set(exp.status, (byStatus.get(exp.status) ?? 0) + exp.amount);
  }

  return {
    title: "Expense Report",
    generatedAt: new Date().toISOString(),
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    data: {
      totalExpenses,
      expenseCount: allExpenses.length,
      avgExpense: allExpenses.length > 0 ? totalExpenses / allExpenses.length : 0,
      byCategory: Array.from(byCategory.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([category, { amount, count }]) => ({ category, amount, count })),
      byVendor: Array.from(byVendor.entries())
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 20)
        .map(([vendor, { amount, count }]) => ({ vendor, amount, count })),
      monthlyExpenses: Array.from(monthlyExpenses.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount })),
      byStatus: Object.fromEntries(byStatus),
      expenses: allExpenses.slice(0, 100),
    },
  };
}

/**
 * Get a customer report with invoice counts and revenue per customer.
 */
export async function getCustomerReport(
  workspaceId: string,
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("total_revenue", { ascending: false })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getCustomerReport failed", { reason: error.message });
    throw new Error("Failed to fetch customer data.");
  }

  const allCustomers = customers ?? [];
  const totalCustomers = allCustomers.length;
  const totalRevenue = allCustomers.reduce((s, c) => s + c.total_revenue, 0);
  const totalInvoices = allCustomers.reduce((s, c) => s + c.total_invoices, 0);

  // New this month
  const firstOfMonth = new Date().toISOString().substring(0, 8) + "01";
  const { count: newThisMonth } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("customer_since", firstOfMonth);

  // Top customers by revenue
  const topByRevenue = allCustomers
    .slice(0, 20)
    .map((c) => ({
      name: c.name,
      revenue: c.total_revenue,
      invoiceCount: c.total_invoices,
    }));

  // Customers with no revenue (inactive)
  const inactiveCustomers = allCustomers.filter((c) => c.total_revenue === 0).length;

  // By tags
  const byTags = new Map<string, number>();
  for (const c of allCustomers) {
    for (const tag of c.tags ?? []) {
      byTags.set(tag, (byTags.get(tag) ?? 0) + 1);
    }
  }

  const customerReport: CustomerReport = {
    totalCustomers,
    newThisMonth: newThisMonth ?? 0,
    topByRevenue,
    byStatus: [],
  };

  return {
    title: "Customer Report",
    generatedAt: new Date().toISOString(),
    data: {
      customerReport,
      totalRevenue,
      totalInvoices,
      avgRevenuePerCustomer: totalCustomers > 0 ? totalRevenue / totalCustomers : 0,
      avgInvoicesPerCustomer: totalCustomers > 0 ? totalInvoices / totalCustomers : 0,
      inactiveCustomers,
      byTags: Object.fromEntries(byTags),
      customers: allCustomers.slice(0, 100),
    },
  };
}

/**
 * Get an inventory report from the products table.
 */
export async function getInventoryReport(
  workspaceId: string,
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getInventoryReport failed", { reason: error.message });
    throw new Error("Failed to fetch product data.");
  }

  const allProducts = products ?? [];
  const totalProducts = allProducts.length;
  const activeProducts = allProducts.filter((p) => p.is_active).length;

  // Total inventory value (selling price × stock)
  const totalValue = allProducts.reduce(
    (s, p) => s + p.unit_price * p.stock_quantity,
    0,
  );

  // Total cost value
  const totalCostValue = allProducts.reduce(
    (s, p) => s + p.cost_price * p.stock_quantity,
    0,
  );

  // Low stock items
  const lowStock = allProducts.filter(
    (p) => p.is_active && p.stock_quantity <= p.low_stock_threshold,
  );

  // Out of stock
  const outOfStock = allProducts.filter(
    (p) => p.is_active && p.stock_quantity === 0,
  );

  // By category
  const byCategory = new Map<string, { count: number; value: number; stock: number }>();
  for (const p of allProducts) {
    const existing = byCategory.get(p.category) ?? { count: 0, value: 0, stock: 0 };
    existing.count += 1;
    existing.value += p.unit_price * p.stock_quantity;
    existing.stock += p.stock_quantity;
    byCategory.set(p.category, existing);
  }

  // By product type
  const byType = new Map<string, number>();
  for (const p of allProducts) {
    byType.set(p.product_type, (byType.get(p.product_type) ?? 0) + 1);
  }

  // Potential profit margin
  const avgMargin =
    totalValue > 0
      ? ((totalValue - totalCostValue) / totalValue) * 100
      : 0;

  return {
    title: "Inventory Report",
    generatedAt: new Date().toISOString(),
    data: {
      totalProducts,
      activeProducts,
      inactiveProducts: totalProducts - activeProducts,
      totalValue,
      totalCostValue,
      potentialProfit: totalValue - totalCostValue,
      avgMargin: `${avgMargin.toFixed(1)}%`,
      lowStockItems: lowStock.length,
      lowStockProducts: lowStock.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock_quantity,
        threshold: p.low_stock_threshold,
      })),
      outOfStockItems: outOfStock.length,
      outOfStockProducts: outOfStock.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
      })),
      byCategory: Array.from(byCategory.entries()).map(
        ([category, { count, value, stock }]) => ({ category, count, value, stock }),
      ),
      byType: Object.fromEntries(byType),
      products: allProducts.slice(0, 100),
    },
  };
}

/**
 * Get a project report from the projects table.
 */
export async function getProjectReport(
  workspaceId: string,
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getProjectReport failed", { reason: error.message });
    throw new Error("Failed to fetch project data.");
  }

  // Fetch tasks for each project
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, status, priority, project_id")
    .eq("workspace_id", workspaceId)
    .limit(PAGINATION.MAX_PAGE_SIZE);

  const allProjects = projects ?? [];
  const allTasks = tasks ?? [];
  const totalProjects = allProjects.length;
  const totalBudget = allProjects.reduce((s, p) => s + (p.budget ?? 0), 0);

  // Project status distribution
  const byStatus = new Map<string, number>();
  for (const p of allProjects) {
    byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
  }

  // Tasks per project
  const projectTasks = new Map<string, { total: number; done: number; inProgress: number; todo: number }>();
  for (const t of allTasks) {
    if (!t.project_id) continue;
    const existing = projectTasks.get(t.project_id) ?? { total: 0, done: 0, inProgress: 0, todo: 0 };
    existing.total += 1;
    if (t.status === "done") existing.done += 1;
    else if (t.status === "in_progress") existing.inProgress += 1;
    else if (t.status === "todo") existing.todo += 1;
    projectTasks.set(t.project_id, existing);
  }

  // Average progress
  const avgProgress =
    totalProjects > 0
      ? allProjects.reduce((s, p) => s + p.progress_percent, 0) / totalProjects
      : 0;

  // Overdue projects (end_date < now, status is active)
  const now = new Date().toISOString().split("T")[0];
  const overdueProjects = allProjects.filter(
    (p) => p.status === "active" && p.end_date && p.end_date < now,
  );

  // Completed projects
  const completedProjects = allProjects.filter((p) => p.status === "completed");

  return {
    title: "Project Report",
    generatedAt: new Date().toISOString(),
    data: {
      totalProjects,
      totalTasks: allTasks.length,
      totalBudget,
      avgProgress: `${avgProgress.toFixed(1)}%`,
      completedProjects: completedProjects.length,
      overdueProjects: overdueProjects.length,
      overdueProjectList: overdueProjects.map((p) => ({
        id: p.id,
        name: p.name,
        endDate: p.end_date,
        progress: p.progress_percent,
      })),
      byStatus: Object.fromEntries(byStatus),
      projects: allProjects.map((p) => {
        const taskInfo = projectTasks.get(p.id);
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          priority: p.priority,
          progress: p.progress_percent,
          budget: p.budget,
          startDate: p.start_date,
          endDate: p.end_date,
          taskCount: taskInfo?.total ?? 0,
          completedTasks: taskInfo?.done ?? 0,
          description: p.description,
        };
      }),
    },
  };
}

/**
 * Get an AI usage report from the ai_usage table.
 */
export async function getAiUsageReport(
  workspaceId: string,
  options?: { periodStart?: string; periodEnd?: string },
): Promise<ReportData> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  try { await requireMinimumRole(workspaceId, profile.id, "member"); } catch {
    throw new Error("Workspace not found or access denied.");
  }

  // Get all workspace member IDs to query ai_usage
  const { data: members } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId);

  const memberIds = (members ?? []).map((m) => m.user_id);
  if (!memberIds.length) {
    return {
      title: "AI Usage Report",
      generatedAt: new Date().toISOString(),
      periodStart: options?.periodStart,
      periodEnd: options?.periodEnd,
      data: {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        records: [],
      },
    };
  }

  let query = supabase
    .from("ai_usage")
    .select("*")
    .in("user_id", memberIds);

  if (options?.periodStart) {
    query = query.gte("created_at", options.periodStart);
  }
  if (options?.periodEnd) {
    query = query.lte("created_at", options.periodEnd);
  }

  const { data: records, error } = await query
    .order("created_at", { ascending: false })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  if (error) {
    logger.error("getAiUsageReport failed", { reason: error.message });
    throw new Error("Failed to fetch AI usage data.");
  }

  const allRecords = records ?? [];
  const totalRequests = allRecords.length;
  const totalTokens = allRecords.reduce((s, r) => s + r.total_tokens, 0);
  const totalCost = allRecords.reduce((s, r) => s + r.estimated_cost, 0);
  const avgProcessingTime =
    allRecords.length > 0
      ? allRecords.reduce((s, r) => s + r.processing_ms, 0) / allRecords.length
      : 0;

  // By provider
  const byProvider = new Map<string, { count: number; tokens: number; cost: number }>();
  for (const r of allRecords) {
    const existing = byProvider.get(r.provider) ?? { count: 0, tokens: 0, cost: 0 };
    existing.count += 1;
    existing.tokens += r.total_tokens;
    existing.cost += r.estimated_cost;
    byProvider.set(r.provider, existing);
  }

  // By model
  const byModel = new Map<string, { count: number; tokens: number; cost: number }>();
  for (const r of allRecords) {
    const key = `${r.provider}/${r.model}`;
    const existing = byModel.get(key) ?? { count: 0, tokens: 0, cost: 0 };
    existing.count += 1;
    existing.tokens += r.total_tokens;
    existing.cost += r.estimated_cost;
    byModel.set(key, existing);
  }

  // By status
  const byStatus = new Map<string, number>();
  for (const r of allRecords) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  }

  // By month
  const monthlyUsage = new Map<string, { tokens: number; cost: number; count: number }>();
  for (const r of allRecords) {
    const month = r.created_at.substring(0, 7);
    const existing = monthlyUsage.get(month) ?? { tokens: 0, cost: 0, count: 0 };
    existing.tokens += r.total_tokens;
    existing.cost += r.estimated_cost;
    existing.count += 1;
    monthlyUsage.set(month, existing);
  }

  // Success rate
  const successCount = allRecords.filter((r) => r.status === "success").length;
  const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 0;

  return {
    title: "AI Usage Report",
    generatedAt: new Date().toISOString(),
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    data: {
      totalRequests,
      totalTokens,
      totalCost,
      avgProcessingTime: `${avgProcessingTime.toFixed(0)}ms`,
      successRate: `${successRate.toFixed(1)}%`,
      successCount,
      failedCount: allRecords.filter((r) => r.status === "failed").length,
      cancelledCount: allRecords.filter((r) => r.status === "cancelled").length,
      byProvider: Array.from(byProvider.entries())
        .sort((a, b) => b[1].cost - a[1].cost)
        .map(([provider, info]) => ({ provider, ...info })),
      byModel: Array.from(byModel.entries())
        .sort((a, b) => b[1].cost - a[1].cost)
        .map(([model, info]) => ({ model, ...info })),
      byStatus: Object.fromEntries(byStatus),
      monthlyUsage: Array.from(monthlyUsage.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, info]) => ({ month, ...info })),
      records: allRecords.slice(0, 100),
    },
  };
}

/**
 * Get a financial report using the accounting service dashboard.
 */
export async function getFinancialReport(
  workspaceId: string,
  options?: { periodStart?: string; periodEnd?: string },
): Promise<ReportData> {
  const profile = await requireAuth();
  void profile; // Auth check done inside getFinancialDashboard

  const result = await getFinancialDashboard(workspaceId);

  if (!result.success || !result.dashboard) {
    throw new Error(result.message ?? "Failed to load financial dashboard data.");
  }

  const dashboard = result.dashboard;

  // Fetch additional transaction data for the period
  const supabase = await createServerSupabaseClient();

  let txQuery = supabase
    .from("transactions")
    .select("id, amount, transaction_type, transaction_date, description, accounts!inner(name)")
    .eq("workspace_id", workspaceId);

  if (options?.periodStart) {
    txQuery = txQuery.gte("transaction_date", options.periodStart);
  }
  if (options?.periodEnd) {
    txQuery = txQuery.lte("transaction_date", options.periodEnd);
  }

  const { data: transactions } = await txQuery
    .order("transaction_date", { ascending: false })
    .limit(PAGINATION.MAX_PAGE_SIZE);

  // Monthly income/expense trend
  const monthlyTrend = new Map<string, { income: number; expense: number }>();
  for (const tx of transactions ?? []) {
    const month = tx.transaction_date.substring(0, 7);
    const existing = monthlyTrend.get(month) ?? { income: 0, expense: 0 };
    if (tx.transaction_type === "income") {
      existing.income += tx.amount;
    } else if (tx.transaction_type === "expense") {
      existing.expense += tx.amount;
    }
    monthlyTrend.set(month, existing);
  }

  return {
    title: "Financial Report",
    generatedAt: new Date().toISOString(),
    periodStart: options?.periodStart,
    periodEnd: options?.periodEnd,
    data: {
      dashboard,
      monthlyTrend: Array.from(monthlyTrend.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { income, expense }]) => ({ month, income, expense, net: income - expense })),
      transactions: (transactions ?? []).slice(0, 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Main Dispatcher
// ---------------------------------------------------------------------------

/**
 * Generate a report. Dispatches to the correct generator based on
 * `data.reportType` and optionally exports to the requested format.
 */
export async function generateReport(
  data: GenerateReportRequest,
): Promise<ReportData | ExportResult> {
  try {
    // Step 1: Generate the report data
    let reportData: ReportData;

    switch (data.reportType) {
      case "sales":
        reportData = await getSalesReport(data.workspaceId, {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        break;
      case "revenue":
        reportData = await getRevenueReport(data.workspaceId, {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        break;
      case "expense":
        reportData = await getExpenseReport(data.workspaceId, {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        break;
      case "customer":
        reportData = await getCustomerReport(data.workspaceId);
        break;
      case "inventory":
        reportData = await getInventoryReport(data.workspaceId);
        break;
      case "project":
        reportData = await getProjectReport(data.workspaceId);
        break;
      case "ai_usage":
        reportData = await getAiUsageReport(data.workspaceId, {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        break;
      case "financial":
        reportData = await getFinancialReport(data.workspaceId, {
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        break;
      default:
        throw new Error(`Unknown report type: ${data.reportType}`);
    }

    // Step 2: Return in the requested format
    switch (data.format) {
      case "json":
        return reportData;
      case "csv":
        return await exportReportToCsv(reportData);
      case "pdf":
        return await exportReportToPdf(reportData);
      case "xlsx":
        // XLSX export falls back to CSV for now — no Excel library imported
        return await exportReportToCsv(reportData);
      default:
        return reportData;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("generateReport error", {
      reportType: data.reportType,
      format: data.format,
      error: message,
    });
    throw error;
  }
}
