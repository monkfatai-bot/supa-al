"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  Loader2,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getFinancialDashboard,
  getProfitLoss,
  getBalanceSheet,
} from "@/services/accounting";
import type {
  FinancialDashboard,
  ProfitLossReport,
  BalanceSheetReport,
} from "@/services/accounting";

interface FinancialDashboardProps {
  workspaceId: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function KpiCard({
  title,
  value,
  icon: Icon,
  variant,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  variant: "income" | "expense" | "profit" | "cash";
}) {
  const colorMap = {
    income: "bg-green-500/10 text-green-600",
    expense: "bg-red-500/10 text-red-600",
    profit: "bg-blue-500/10 text-blue-600",
    cash: "bg-amber-500/10 text-amber-600",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${colorMap[variant]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {title}
          </p>
          <p className="text-xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function FinancialDashboardView({ workspaceId }: FinancialDashboardProps) {
  const [dashboard, setDashboard] = useState<FinancialDashboard | null>(null);
  const [plReport, setPlReport] = useState<ProfitLossReport | null>(null);
  const [bsReport, setBsReport] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [plLoading, setPlLoading] = useState(false);
  const [bsLoading, setBsLoading] = useState(false);

  const [periodStart, setPeriodStart] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0]
  );
  const [periodEnd, setPeriodEnd] = useState(
    new Date().toISOString().split("T")[0]
  );

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFinancialDashboard(workspaceId);
      if (res.success && res.dashboard) {
        setDashboard(res.dashboard);
      } else {
        toast.error(res.message || "Failed to load financial dashboard");
      }
    } catch {
      toast.error("Failed to load financial dashboard");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchProfitLoss = useCallback(async () => {
    if (!periodStart || !periodEnd) return;
    setPlLoading(true);
    try {
      const res = await getProfitLoss(workspaceId, { periodStart, periodEnd });
      if (res.success && res.report) {
        setPlReport(res.report);
      } else {
        toast.error(res.message || "Failed to load P&L");
      }
    } catch {
      toast.error("Failed to load P&L report");
    } finally {
      setPlLoading(false);
    }
  }, [workspaceId, periodStart, periodEnd]);

  const fetchBalanceSheet = useCallback(async () => {
    if (!periodEnd) return;
    setBsLoading(true);
    try {
      const res = await getBalanceSheet(workspaceId, { asOfDate: periodEnd });
      if (res.success && res.report) {
        setBsReport(res.report);
      } else {
        toast.error(res.message || "Failed to load balance sheet");
      }
    } catch {
      toast.error("Failed to load balance sheet");
    } finally {
      setBsLoading(false);
    }
  }, [workspaceId, periodEnd]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchProfitLoss();
    fetchBalanceSheet();
  }, [fetchProfitLoss, fetchBalanceSheet]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Financial Overview</h1>
        <p className="text-muted-foreground text-sm">
          Income, expenses, profit & balance sheet at a glance.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Income"
          value={formatCurrency(dashboard?.totalIncome ?? 0)}
          icon={TrendingUp}
          variant="income"
        />
        <KpiCard
          title="Total Expenses"
          value={formatCurrency(dashboard?.totalExpenses ?? 0)}
          icon={TrendingDown}
          variant="expense"
        />
        <KpiCard
          title="Net Profit"
          value={formatCurrency(dashboard?.netProfit ?? 0)}
          icon={DollarSign}
          variant="profit"
        />
        <KpiCard
          title="Cash Balance"
          value={formatCurrency(dashboard?.cashBalance ?? 0)}
          icon={Wallet}
          variant="cash"
        />
      </div>

      {/* Top Expense Categories */}
      {dashboard?.topExpenseCategories && dashboard.topExpenseCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboard.topExpenseCategories.map((cat, i) => {
                const maxAmount = Math.max(
                  ...dashboard.topExpenseCategories.map((c) => c.amount),
                  1
                );
                const pct = (cat.amount / maxAmount) * 100;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-32 shrink-0 truncate text-sm">
                      {cat.category}
                    </span>
                    <div className="bg-muted h-5 flex-1 overflow-hidden rounded">
                      <div
                        className="h-full rounded bg-red-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-sm font-medium">
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Date range controls for reports */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="fin-start" className="text-xs">
              Period Start
            </Label>
            <Input
              id="fin-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="fin-end" className="text-xs">
              Period End / As-of Date
            </Label>
            <Input
              id="fin-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="h-9"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              fetchProfitLoss();
              fetchBalanceSheet();
            }}
            disabled={plLoading || bsLoading}
          >
            {plLoading || bsLoading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Refresh Reports
          </Button>
        </CardContent>
      </Card>

      {/* P&L Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit & Loss</CardTitle>
          <CardDescription>
            {periodStart} to {periodEnd}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {plLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : plReport ? (
            <>
              {/* Income Lines */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-green-600">
                  <ArrowUpRight className="h-4 w-4" /> Revenue
                </h3>
                {plReport.revenue.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No revenue data.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plReport.revenue.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>{line.categoryName}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total Revenue</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(plReport.totalRevenue)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>

              {/* Expense Lines */}
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-600">
                  <ArrowDownRight className="h-4 w-4" /> Expenses
                </h3>
                {plReport.expenses.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No expense data.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plReport.expenses.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>{line.categoryName}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.totalAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total Expenses</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(plReport.totalExpenses)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>

              {/* Net Profit Highlight */}
              <div
                className={`rounded-lg border-2 p-4 text-center ${
                  plReport.netIncome >= 0
                    ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
                    : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
                }`}
              >
                <p className="text-sm font-medium">Net {plReport.netIncome >= 0 ? "Profit" : "Loss"}</p>
                <p
                  className={`text-2xl font-bold ${plReport.netIncome >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
                >
                  {formatCurrency(plReport.netIncome)}
                </p>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No P&L data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Balance Sheet Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance Sheet</CardTitle>
          <CardDescription>As of {periodEnd}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {bsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : bsReport ? (
            <>
              {/* Assets */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Assets</h3>
                {bsReport.assets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No assets data.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bsReport.assets.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.accountCode}
                            </span>
                            {line.accountName}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total Assets</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(bsReport.totalAssets)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>

              {/* Liabilities */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Liabilities</h3>
                {bsReport.liabilities.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No liabilities data.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bsReport.liabilities.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.accountCode}
                            </span>
                            {line.accountName}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total Liabilities</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(bsReport.totalLiabilities)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>

              {/* Equity */}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Equity</h3>
                {bsReport.equity.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No equity data.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bsReport.equity.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <span className="text-muted-foreground mr-2 text-xs">
                              {line.accountCode}
                            </span>
                            {line.accountName}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold">Total Equity</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrency(bsReport.totalEquity)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </div>

              {/* Verification */}
              <div className="rounded-lg border bg-muted/50 p-3 text-center text-sm">
                <span className="text-muted-foreground">
                  Assets ({formatCurrency(bsReport.totalAssets)}) = Liabilities ({formatCurrency(bsReport.totalLiabilities)}) + Equity ({formatCurrency(bsReport.totalEquity)})
                </span>
                {Math.abs(bsReport.totalAssets - (bsReport.totalLiabilities + bsReport.totalEquity)) < 0.01 ? (
                  <Badge className="ml-2" variant="default">Balanced</Badge>
                ) : (
                  <Badge className="ml-2" variant="destructive">Out of Balance</Badge>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No balance sheet data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
