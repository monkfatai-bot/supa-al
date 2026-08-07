"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — Reports view.
 *
 * The dashboard / reports surface — shows aggregate stats from
 * `/api/business/dashboard` (revenue, expenses, pipeline, customer /
 * invoice / project counts) plus a "revenue vs expenses" report card
 * and a "top customers" card.
 *
 * Composed of two parts:
 *
 *   - {@link StatsGrid} — a responsive 4-col grid of {@link StatCard}s
 *     populated from {@link useDashboard}.
 *   - A two-column layout with the monthly revenue/expenses breakdown
 *     (from {@link useReports} of type `revenue` and `expenses`) on the
 *     left, and the top-customers list (from `revenue.byCustomer`) on
 *     the right.
 *
 * @module @/components/business/report-view
 */
import * as React from "react";
import {
  AlertCircle,
  CalendarClock,
  DollarSign,
  FileText,
  FolderKanban,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  useDashboard,
  useReports,
} from "@/hooks/use-business";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { formatCurrency, formatNumber } from "@/lib/utils/index";

export interface ReportViewProps {
  workspaceId: string;
  className?: string;
}

export function ReportView({ workspaceId, className }: ReportViewProps) {
  const dashboardQuery = useDashboard(workspaceId);
  const revenueQuery = useReports(workspaceId, "revenue");
  const expensesQuery = useReports(workspaceId, "expenses");

  const isLoading =
    dashboardQuery.isLoading ||
    revenueQuery.isLoading ||
    expensesQuery.isLoading;
  const isError =
    dashboardQuery.isError || revenueQuery.isError || expensesQuery.isError;

  const stats = dashboardQuery.data;
  const revenue = revenueQuery.data?.revenue;
  const expenses = expensesQuery.data?.expenses;

  const topCustomers = React.useMemo(() => {
    if (!revenue?.byCustomer) return [];
    return [...revenue.byCustomer]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [revenue]);

  return (
    <div className={cn("space-y-4 p-4 sm:p-6 lg:p-8", className)}>
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          Reports
        </h2>
        <p className="text-sm text-muted-foreground">
          Revenue, expenses, pipeline, and top customers — at a glance.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Couldn't load reports"
          description="Please try again later."
        />
      ) : !stats ? (
        <EmptyState
          icon={TrendingUp}
          title="No data yet"
          description="Once you start creating customers, invoices, and projects, the dashboard will populate here."
        />
      ) : (
        <>
          {/* Stats grid */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Revenue this month"
              value={formatCurrency(stats.revenueThisMonth)}
              icon={DollarSign}
              hint={`Year: ${formatCurrency(stats.revenueThisYear)}`}
            />
            <StatCard
              label="Expenses this month"
              value={formatCurrency(stats.expensesThisMonth)}
              icon={Wallet}
              hint={`Year: ${formatCurrency(stats.expensesThisYear)}`}
              trend={
                stats.revenueThisMonth === 0
                  ? undefined
                  : Math.round(
                      (stats.expensesThisMonth /
                        Math.max(stats.revenueThisMonth, 1)) *
                        100 -
                        100,
                    )
              }
              trendSuffix="% of revenue"
            />
            <StatCard
              label="Net this month"
              value={formatCurrency(stats.netThisMonth)}
              icon={stats.netThisMonth >= 0 ? TrendingUp : TrendingDown}
            />
            <StatCard
              label="Outstanding"
              value={formatCurrency(stats.outstandingAmount)}
              icon={FileText}
              hint={`${stats.overdueInvoiceCount} overdue`}
            />
          </div>

          {/* Secondary stats */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Customers"
              value={formatNumber(stats.customerCount)}
              icon={Users}
              hint={`${stats.activeCustomerCount} active`}
            />
            <StatCard
              label="Leads"
              value={formatNumber(stats.leadCount)}
              hint={`${stats.openLeadCount} open`}
            />
            <StatCard
              label="Pipeline (weighted)"
              value={formatCurrency(stats.weightedPipeline)}
              icon={TrendingUp}
              hint={`${stats.openOpportunityCount} open opportunities`}
            />
            <StatCard
              label="Upcoming events"
              value={formatNumber(stats.calendarEventUpcomingCount)}
              icon={CalendarClock}
            />
          </div>

          {/* Charts + top customers */}
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">
                  Revenue vs expenses
                </CardTitle>
                <CardDescription>
                  Monthly breakdown for the trailing year.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueVsExpensesChart
                  revenue={revenue?.byMonth ?? []}
                  expenses={expenses?.byMonth ?? []}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top customers</CardTitle>
                <CardDescription>
                  By revenue (last 12 months).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {topCustomers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No revenue recorded yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {topCustomers.map((c, i) => (
                      <li
                        key={c.customerId ?? `c-${i}`}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-medium">
                            {i + 1}
                          </span>
                          <span className="truncate text-muted-foreground">
                            {c.customerId ? "Customer" : "Walk-in"}
                          </span>
                        </span>
                        <Badge variant="secondary" className="tabular-nums">
                          {formatCurrency(c.total)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Tiny CSS-bar chart of monthly revenue vs expenses. No external chart
 * dependency — keeps the bundle small. Each month renders as a stacked
 * pair of vertical bars with a small tooltip on hover.
 */
function RevenueVsExpensesChart({
  revenue,
  expenses,
}: {
  revenue: Array<{ month: string; total: number }>;
  expenses: Array<{ month: string; total: number }>;
}) {
  const months = React.useMemo(() => {
    const lookup = new Map<string, { revenue: number; expenses: number }>();
    for (const r of revenue) {
      const m = lookup.get(r.month) ?? { revenue: 0, expenses: 0 };
      m.revenue = r.total;
      lookup.set(r.month, m);
    }
    for (const e of expenses) {
      const m = lookup.get(e.month) ?? { revenue: 0, expenses: 0 };
      m.expenses = e.total;
      lookup.set(e.month, m);
    }
    return Array.from(lookup.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12);
  }, [revenue, expenses]);

  if (months.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No transactions recorded yet.
      </p>
    );
  }

  const max = Math.max(
    1,
    ...months.map(([, v]) => Math.max(v.revenue, v.expenses)),
  );

  return (
    <div className="flex h-40 items-end gap-2 overflow-x-auto">
      {months.map(([month, v]) => {
        const revH = Math.round((v.revenue / max) * 100);
        const expH = Math.round((v.expenses / max) * 100);
        return (
          <div
            key={month}
            className="flex h-full min-w-[28px] flex-1 flex-col items-center gap-1"
            title={`${month} · rev ${formatCurrency(v.revenue)} / exp ${formatCurrency(v.expenses)}`}
          >
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              <div
                className="w-1.5 rounded-t bg-emerald-500/80"
                style={{ height: `${revH}%` }}
              />
              <div
                className="w-1.5 rounded-t bg-rose-500/80"
                style={{ height: `${expH}%` }}
              />
            </div>
            <span className="text-[9px] text-muted-foreground">
              {month.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
