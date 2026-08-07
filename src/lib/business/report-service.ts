/**
 * Supa AI — Phase 10 report service (server-only).
 *
 * Aggregate read-side queries for the business dashboard + reports UI:
 *   - `dashboard()`     — a single aggregate snapshot (counts + month /
 *                         year revenue / expenses / net).
 *   - `revenue()`       — revenue breakdown by month + by customer.
 *   - `expenses()`      — expense breakdown by month + by category.
 *   - `pipeline()`     — opportunity pipeline by stage + upcoming
 *                         closings.
 *
 * All queries are read-only and rely on the existing RLS policies to
 * gate access. `assertMember` is called once per method for
 * defense-in-depth (RLS is the real gate).
 *
 * @module @/lib/business/report-service
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotFoundError, ValidationError } from "@/lib/errors";

import type {
  BusinessDashboardStats,
  ExpenseReport,
  Opportunity,
  OpportunityStage,
  PipelineReport,
  ReportRangeOptions,
  RevenueReport,
} from "./types";
import {
  assertMember,
  toDbError,
  wrapUnexpected,
} from "./core";

function monthKey(iso: string): string {
  // Returns `YYYY-MM` for a given ISO date / date string.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const OPEN_OPPORTUNITY_STAGES: OpportunityStage[] = [
  "prospecting",
  "qualification",
  "needs-analysis",
  "proposal",
  "negotiation",
];

const OPEN_LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "negotiation"];

export class ReportService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  async dashboard(
    workspaceId: string,
    userId: string,
  ): Promise<BusinessDashboardStats> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString();
      const yearStart = new Date(
        Date.UTC(now.getUTCFullYear(), 0, 1),
      ).toISOString();
      const todayIso = now.toISOString().slice(0, 10);

      // Customers
      const customersAll = await this.supabase
        .from("customers")
        .select("id, status", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      const customerActive = await this.supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "active");

      // Leads
      const leadsAll = await this.supabase
        .from("leads")
        .select("id, status", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      let openLeadsCount = 0;
      for (const status of OPEN_LEAD_STATUSES) {
        const r = await this.supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", status);
        openLeadsCount += Number(r.count ?? 0);
      }

      // Opportunities
      const opportunitiesAll = await this.supabase
        .from("opportunities")
        .select("id, stage, amount, probability", { count: "exact", head: false })
        .eq("workspace_id", workspaceId);
      const opps = (opportunitiesAll.data ?? []) as Array<{
        stage: string;
        amount: number;
        probability: number;
      }>;
      const openOpps = opps.filter((o) =>
        (OPEN_OPPORTUNITY_STAGES as string[]).includes(o.stage),
      );
      const weightedPipeline = openOpps.reduce(
        (sum, o) => sum + Number(o.amount ?? 0) * (Number(o.probability ?? 0) / 100),
        0,
      );

      // Invoices
      const invoicesAll = await this.supabase
        .from("invoices")
        .select("id, status, total, issue_date, due_date")
        .eq("workspace_id", workspaceId);
      const invRows = (invoicesAll.data ?? []) as Array<{
        status: string;
        total: number;
        issue_date: string;
        due_date: string | null;
      }>;
      const paidInvoices = invRows.filter((i) => i.status === "paid");
      const overdueInvoices = invRows.filter((i) => i.status === "overdue");
      const outstanding = invRows
        .filter((i) => ["sent", "viewed", "partial", "overdue"].includes(i.status))
        .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
      const revenueThisMonth = paidInvoices
        .filter((i) => i.issue_date >= monthStart.slice(0, 10))
        .reduce((sum, i) => sum + Number(i.total ?? 0), 0);
      const revenueThisYear = paidInvoices
        .filter((i) => i.issue_date >= yearStart.slice(0, 10))
        .reduce((sum, i) => sum + Number(i.total ?? 0), 0);

      // Expenses
      const expensesAll = await this.supabase
        .from("expenses")
        .select("id, status, amount, currency, date")
        .eq("workspace_id", workspaceId);
      const expRows = (expensesAll.data ?? []) as Array<{
        status: string;
        amount: number;
        date: string;
      }>;
      const paidExpenses = expRows.filter((e) => e.status === "paid");
      const expensesThisMonth = paidExpenses
        .filter((e) => e.date >= monthStart.slice(0, 10))
        .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
      const expensesThisYear = paidExpenses
        .filter((e) => e.date >= yearStart.slice(0, 10))
        .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

      // Products
      const productsAll = await this.supabase
        .from("products")
        .select("id, is_active", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      const productsActive = await this.supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("is_active", true);

      // Projects
      const projectsAll = await this.supabase
        .from("projects")
        .select("id, status", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);
      const projectsActive = await this.supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "active");

      // Upcoming calendar events
      const calendarUpcoming = await this.supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("start_time", now.toISOString());

      void todayIso;

      return {
        customerCount: Number(customersAll.count ?? 0),
        activeCustomerCount: Number(customerActive.count ?? 0),
        leadCount: Number(leadsAll.count ?? 0),
        openLeadCount: openLeadsCount,
        opportunityCount: Number(opportunitiesAll.count ?? 0),
        openOpportunityCount: openOpps.length,
        weightedPipeline,
        invoiceCount: invRows.length,
        paidInvoiceCount: paidInvoices.length,
        overdueInvoiceCount: overdueInvoices.length,
        outstandingAmount: outstanding,
        revenueThisMonth,
        revenueThisYear,
        expensesThisMonth,
        expensesThisYear,
        netThisMonth: revenueThisMonth - expensesThisMonth,
        productCount: Number(productsAll.count ?? 0),
        activeProductCount: Number(productsActive.count ?? 0),
        projectCount: Number(projectsAll.count ?? 0),
        activeProjectCount: Number(projectsActive.count ?? 0),
        calendarEventUpcomingCount: Number(calendarUpcoming.count ?? 0),
      };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing dashboard.", {
        workspaceId,
      });
    }
  }

  async revenue(
    workspaceId: string,
    userId: string,
    opts: ReportRangeOptions = {},
  ): Promise<RevenueReport> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("invoices")
        .select("id, customer_id, total, issue_date")
        .eq("workspace_id", workspaceId)
        .eq("status", "paid");
      if (opts.dateFrom) query = query.gte("issue_date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("issue_date", opts.dateTo);

      const { data, error } = await query;
      if (error) throw toDbError(error, "report.revenue failed");

      const rows = (data ?? []) as Array<{
        id: string;
        customer_id: string | null;
        total: number;
        issue_date: string;
      }>;

      let total = 0;
      const byMonthMap = new Map<string, number>();
      const byCustomerMap = new Map<string | null, number>();
      for (const row of rows) {
        const amt = Number(row.total ?? 0);
        total += amt;
        const mk = monthKey(row.issue_date);
        byMonthMap.set(mk, (byMonthMap.get(mk) ?? 0) + amt);
        byCustomerMap.set(
          row.customer_id,
          (byCustomerMap.get(row.customer_id) ?? 0) + amt,
        );
      }

      const byMonth = Array.from(byMonthMap.entries())
        .map(([month, value]) => ({ month, total: value }))
        .sort((a, b) => a.month.localeCompare(b.month));

      const byCustomer = Array.from(byCustomerMap.entries())
        .map(([customerId, value]) => ({ customerId, total: value }))
        .sort((a, b) => b.total - a.total);

      return { total, byMonth, byCustomer };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing revenue report.", {
        workspaceId,
      });
    }
  }

  async expenses(
    workspaceId: string,
    userId: string,
    opts: ReportRangeOptions = {},
  ): Promise<ExpenseReport> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      let query = this.supabase
        .from("expenses")
        .select("id, amount, currency, date, category")
        .eq("workspace_id", workspaceId)
        .eq("status", "paid");
      if (opts.dateFrom) query = query.gte("date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("date", opts.dateTo);

      const { data, error } = await query;
      if (error) throw toDbError(error, "report.expenses failed");

      const rows = (data ?? []) as Array<{
        id: string;
        amount: number;
        currency: string;
        date: string;
        category: string;
      }>;

      let total = 0;
      const byMonthMap = new Map<string, number>();
      const byCategoryMap = new Map<string, number>();
      for (const row of rows) {
        const amt = Number(row.amount ?? 0);
        total += amt;
        const mk = monthKey(row.date);
        byMonthMap.set(mk, (byMonthMap.get(mk) ?? 0) + amt);
        const cat = row.category ?? "general";
        byCategoryMap.set(cat, (byCategoryMap.get(cat) ?? 0) + amt);
      }

      const byMonth = Array.from(byMonthMap.entries())
        .map(([month, value]) => ({ month, total: value }))
        .sort((a, b) => a.month.localeCompare(b.month));
      const byCategory = Array.from(byCategoryMap.entries())
        .map(([category, value]) => ({ category, total: value }))
        .sort((a, b) => b.total - a.total);

      return { total, byMonth, byCategory };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing expense report.", {
        workspaceId,
      });
    }
  }

  async pipeline(
    workspaceId: string,
    userId: string,
  ): Promise<PipelineReport> {
    try {
      await assertMember(this.supabase, workspaceId, userId);

      const { data, error } = await this.supabase
        .from("opportunities")
        .select("*")
        .eq("workspace_id", workspaceId);
      if (error) throw toDbError(error, "report.pipeline failed");

      const rows = (data ?? []) as Array<Opportunity>;

      const byStageMap = new Map<OpportunityStage, { count: number; value: number }>();
      let totalValue = 0;
      let weightedValue = 0;
      const upcoming: Array<{
        opportunity: typeof rows[number];
        daysUntilClose: number;
      }> = [];

      const now = new Date();
      for (const row of rows) {
        const amt = Number(row.amount ?? 0);
        totalValue += amt;
        weightedValue += amt * (Number(row.probability ?? 0) / 100);
        const stage = row.stage as OpportunityStage;
        const v = byStageMap.get(stage) ?? { count: 0, value: 0 };
        v.count += 1;
        v.value += amt;
        byStageMap.set(stage, v);
        if (
          OPEN_OPPORTUNITY_STAGES.includes(stage) &&
          row.expected_close_date
        ) {
          const close = new Date(row.expected_close_date);
          if (!Number.isNaN(close.getTime())) {
            const days = Math.ceil(
              (close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            if (days >= 0 && days <= 90) {
              upcoming.push({ opportunity: row, daysUntilClose: days });
            }
          }
        }
      }

      const byStage = Array.from(byStageMap.entries())
        .map(([stage, v]) => ({ stage, ...v }))
        .sort((a, b) => a.stage.localeCompare(b.stage));
      upcoming.sort((a, b) => a.daysUntilClose - b.daysUntilClose);

      return {
        totalValue,
        weightedValue,
        byStage,
        upcoming: upcoming.slice(0, 10),
      };
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      throw wrapUnexpected(err, "Unexpected failure computing pipeline.", {
        workspaceId,
      });
    }
  }
}

export async function createReportService(): Promise<ReportService> {
  const supabase = await createSupabaseServerClient();
  return new ReportService(supabase);
}
