"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingDown,
  FolderKanban,
  Users,
  AlertTriangle,
  Clock,
  Package,
  ArrowUpRight,
  ArrowRight,
  FileText,
  ScrollText,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInvoiceStats, getInvoices } from "@/services/invoice/actions";
import type { InvoiceDashboardStats, InvoiceWithItems } from "@/services/invoice/types";
import { getExpenseStats } from "@/services/expense/actions";
import type { ExpenseDashboardStats } from "@/services/expense/types";
import { getProjectDashboard } from "@/services/project/actions";
import type { ProjectDashboardStats } from "@/services/project/types";
import { getPipelineSummary } from "@/services/crm/actions";
import type { PipelineSummary } from "@/services/crm/types";
import { getInventoryStats } from "@/services/inventory/actions";
import type { InventoryStats } from "@/services/inventory/types";

// ── Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `in ${Math.abs(diffDays)}d`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function getStatusVariant(status: string) {
  switch (status) {
    case "paid":
      return "default" as const;
    case "sent":
      return "secondary" as const;
    case "overdue":
      return "destructive" as const;
    case "draft":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function getPriorityColor(priority: string | null | undefined): string {
  switch (priority) {
    case "high":
      return "text-red-500";
    case "medium":
      return "text-yellow-500";
    case "low":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
}

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  qualification: "Qualification",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
};

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-blue-500",
  qualification: "bg-indigo-500",
  proposal: "bg-purple-500",
  negotiation: "bg-amber-500",
  closed_won: "bg-green-500",
  closed_lost: "bg-red-500",
};

// ── Props ────────────────────────────────────────────────────────────

interface BusinessDashboardProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────────

export function BusinessDashboard({ workspaceId }: BusinessDashboardProps) {
  const [loading, setLoading] = useState(true);

  // Data state
  const [invoiceStats, setInvoiceStats] = useState<InvoiceDashboardStats | null>(null);
  const [expenseStats, setExpenseStats] = useState<ExpenseDashboardStats | null>(null);
  const [projectStats, setProjectStats] = useState<ProjectDashboardStats | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary[]>([]);
  const [inventoryStatsData, setInventoryStatsData] = useState<InventoryStats | null>(null);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceWithItems[]>([]);

  const fetchData = useCallback(() => {
    setLoading(true);

    Promise.all([
      getInvoiceStats(workspaceId).then((stats) => setInvoiceStats(stats)),
      getExpenseStats(workspaceId).then((res) => {
        if (res.success && res.stats) setExpenseStats(res.stats);
      }),
      getProjectDashboard(workspaceId).then((res) => {
        if (res.success && res.stats) setProjectStats(res.stats);
      }),
      getPipelineSummary(workspaceId).then((res) => {
        if (res.success && res.summary) setPipelineSummary(res.summary);
      }),
      getInventoryStats(workspaceId).then((res) => {
        if (res.success && res.stats) setInventoryStatsData(res.stats);
      }),
      getInvoices(workspaceId, { page: 1, pageSize: 5 }).then((res) => {
        setRecentInvoices(res.invoices);
      }),
    ]).finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Compute open leads from pipeline
  const openLeads = pipelineSummary
    .filter((s) => s.stage === "lead" || s.stage === "qualification")
    .reduce((sum, s) => sum + s.count, 0);

  const totalPipelineValue = pipelineSummary.reduce((sum, s) => sum + s.value, 0);
  const maxStageValue = Math.max(...pipelineSummary.map((s) => s.value), 1);

  const totalExpenseThisMonth = expenseStats?.totalThisMonth ?? 0;

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold tracking-tight">Business Dashboard</h2>

      {/* ── Top Row: 4 Stat Cards ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (Paid)</CardTitle>
            <DollarSign className="text-emerald-600 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(invoiceStats?.totalRevenue ?? 0)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {formatCurrency(invoiceStats?.paidThisMonth ?? 0)} this month
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Expenses Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses (Month)</CardTitle>
            <TrendingDown className="text-red-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(totalExpenseThisMonth)}
                </div>
                <p className="text-muted-foreground text-xs">
                  {expenseStats?.pendingCount ?? 0} pending approvals
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Projects Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="text-blue-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {projectStats?.activeProjects ?? 0}
                </div>
                <p className="text-muted-foreground text-xs">
                  {projectStats?.overdueTasks ?? 0} overdue tasks
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Open Leads Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Leads</CardTitle>
            <Users className="text-purple-500 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">{openLeads}</div>
                <p className="text-muted-foreground text-xs">
                  Pipeline: {formatCurrency(totalPipelineValue)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Second Row: Pipeline + Recent Invoices ──────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5" />
              Sales Pipeline
            </CardTitle>
            <CardDescription>
              Value by stage across {pipelineSummary.reduce((s, p) => s + p.count, 0)} opportunities
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {pipelineSummary.map((stage) => (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {STAGE_LABELS[stage.stage] ?? stage.stage}
                      </span>
                      <span className="text-muted-foreground">
                        {stage.count} opp &middot; {formatCurrency(stage.value)}
                      </span>
                    </div>
                    <div className="bg-muted h-3 w-full overflow-hidden rounded-full">
                      <div
                        className={`h-full rounded-full transition-all ${STAGE_COLORS[stage.stage] ?? "bg-gray-400"}`}
                        style={{
                          width: `${Math.max((stage.value / maxStageValue) * 100, stage.count > 0 ? 2 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Recent Invoices
            </CardTitle>
            <CardDescription>Last 5 invoices created.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          {inv.invoice_number}
                        </TableCell>
                        <TableCell>
                          {inv.customer?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(inv.total)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(inv.status)} className="text-xs">
                            {inv.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(inv.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {recentInvoices.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-muted-foreground text-center">
                          No invoices yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Third Row: Expense Breakdown + Upcoming Tasks ────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense Breakdown by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Expense Breakdown
            </CardTitle>
            <CardDescription>
              This month by category
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : expenseStats && expenseStats.byCategory.length > 0 ? (
              <div className="max-h-96 space-y-3 overflow-y-auto">
                {expenseStats.byCategory.map((cat) => {
                  const pct = totalExpenseThisMonth > 0
                    ? (cat.amount / totalExpenseThisMonth) * 100
                    : 0;
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{cat.category}</span>
                        <span className="ml-2 shrink-0 text-muted-foreground">
                          {formatCurrency(cat.amount)} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-red-400 h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="border-t pt-2">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatCurrency(totalExpenseThisMonth)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No expenses this month.</p>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Tasks / Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Upcoming Deadlines
            </CardTitle>
            <CardDescription>Tasks due within the next 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : projectStats && projectStats.upcomingDeadlines.length > 0 ? (
              <ScrollArea className="max-h-96">
                <div className="space-y-3">
                  {projectStats.upcomingDeadlines.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <Clock className="text-amber-600 h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium">{task.title}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {task.status}
                          </Badge>
                          <span className={getPriorityColor(task.priority)}>
                            {task.priority}
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-muted-foreground text-xs">
                          {task.due_date
                            ? formatRelativeDate(task.due_date)
                            : "No date"}
                        </p>
                        {task.due_date && (
                          <p className="text-muted-foreground text-xs">
                            {formatDate(task.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground text-sm">No upcoming deadlines.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom Row: Inventory Summary ────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Summary
          </CardTitle>
          <CardDescription>Current product stock status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">Total Products</p>
                <p className="text-xl font-bold">
                  {inventoryStatsData?.totalProducts ?? 0}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">Total Value</p>
                <p className="text-xl font-bold">
                  {formatCurrency(inventoryStatsData?.totalValue ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">Low Stock</p>
                <p className="text-amber-600 text-xl font-bold">
                  {inventoryStatsData?.lowStockCount ?? 0}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-muted-foreground text-sm">Out of Stock</p>
                <p className="text-red-600 text-xl font-bold">
                  {inventoryStatsData?.outOfStockCount ?? 0}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {/* ── Quick Navigation Grid ────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ArrowRight className="h-5 w-5" />
          Quick Access
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "CRM", href: "/business/crm", icon: Users, color: "text-purple-500", bg: "bg-purple-500/10" },
            { label: "Invoices", href: "/business/invoices", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Projects", href: "/business/projects", icon: FolderKanban, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Proposals", href: "/business/proposals", icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Contracts", href: "/business/contracts", icon: ScrollText, color: "text-orange-500", bg: "bg-orange-500/10" },
            { label: "Expenses", href: "/business/expenses", icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Calendar", href: "/business/calendar", icon: CalendarDays, color: "text-sky-500", bg: "bg-sky-500/10" },
            { label: "Products", href: "/business/products", icon: Package, color: "text-teal-500", bg: "bg-teal-500/10" },
            { label: "Reports", href: "/business/reports", icon: BarChart3, color: "text-indigo-500", bg: "bg-indigo-500/10" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-foreground/20">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`${item.bg} ${item.color} flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110`}>
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                  </div>
                  <ArrowRight className="text-muted-foreground ml-auto h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
