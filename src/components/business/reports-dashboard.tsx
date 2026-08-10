"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Download,
  FileText,
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Package,
  FolderKanban,
  Bot,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSalesReport,
  getRevenueReport,
  getExpenseReport,
  getCustomerReport,
  getInventoryReport,
  getProjectReport,
  getAiUsageReport,
  exportReportToCsv,
} from "@/services/reports";
import type { ReportData } from "@/services/reports";

interface ReportsDashboardProps {
  workspaceId: string;
}

type TabKey = "sales" | "revenue" | "expenses" | "customers" | "inventory" | "projects" | "ai_usage";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "sales", label: "Sales", icon: BarChart3 },
  { key: "revenue", label: "Revenue", icon: TrendingUp },
  { key: "expenses", label: "Expenses", icon: TrendingDown },
  { key: "customers", label: "Customers", icon: Users },
  { key: "inventory", label: "Inventory", icon: Package },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "ai_usage", label: "AI Usage", icon: Bot },
];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SimpleBar({
  items,
  valueKey,
  labelKey,
  maxItems = 12,
  color = "bg-primary",
}: {
  items: Record<string, unknown>[];
  valueKey: string;
  labelKey: string;
  maxItems?: number;
  color?: string;
}) {
  const visible = items.slice(0, maxItems);
  const maxVal = Math.max(...visible.map((i) => Number(i[valueKey]) || 0), 1);

  return (
    <div className="space-y-2">
      {visible.map((item, idx) => {
        const val = Number(item[valueKey]) || 0;
        const pct = (val / maxVal) * 100;
        return (
          <div key={idx} className="flex items-center gap-3">
            <span className="text-muted-foreground w-24 shrink-0 truncate text-xs">
              {String(item[labelKey])}
            </span>
            <div className="bg-muted h-5 flex-1 overflow-hidden rounded">
              <div
                className={`h-full rounded ${color} transition-all duration-500`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-xs font-medium">
              {formatCurrency(val)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  subtitle,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{title}</p>
          <p className="truncate text-lg font-semibold">{value}</p>
          {subtitle && (
            <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsDashboard({ workspaceId }: ReportsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("sales");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportData | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const opts = {
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
      };
      let data: ReportData;
      switch (activeTab) {
        case "sales":
          data = await getSalesReport(workspaceId, opts);
          break;
        case "revenue":
          data = await getRevenueReport(workspaceId, opts);
          break;
        case "expenses":
          data = await getExpenseReport(workspaceId, opts);
          break;
        case "customers":
          data = await getCustomerReport(workspaceId);
          break;
        case "inventory":
          data = await getInventoryReport(workspaceId);
          break;
        case "projects":
          data = await getProjectReport(workspaceId);
          break;
        case "ai_usage":
          data = await getAiUsageReport(workspaceId, opts);
          break;
      }
      setReport(data);
    } catch {
      toast.error("Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activeTab, periodStart, periodEnd]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  async function handleExportCsv() {
    if (!report) return;
    try {
      const result = await exportReportToCsv(report);
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Failed to export CSV");
    }
  }

  function handleExportPdf() {
    toast.info("PDF export coming soon");
  }

  function extractArray(key: string): Record<string, unknown>[] {
    if (!report?.data) return [];
    const val = report.data[key];
    return Array.isArray(val) ? (val as Record<string, unknown>[]) : [];
  }

  function extractNumber(key: string): number {
    if (!report?.data) return 0;
    const val = report.data[key];
    return typeof val === "number" ? val : 0;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm">Business intelligence across all modules.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!report}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="period-start" className="text-xs">From</Label>
            <Input
              id="period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="period-end" className="text-xs">To</Label>
            <Input
              id="period-end"
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={fetchReport} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="space-y-4">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : !report ? (
              <Card>
                <CardContent className="flex h-64 items-center justify-center">
                  <p className="text-muted-foreground text-sm">No data available.</p>
                </CardContent>
              </Card>
            ) : (
              <TabContent
                tabKey={tab.key}
                report={report}
                extractArray={extractArray}
                extractNumber={extractNumber}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TabContent({
  tabKey,
  report,
  extractArray,
  extractNumber,
}: {
  tabKey: TabKey;
  report: ReportData;
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  switch (tabKey) {
    case "sales":
      return <SalesTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "revenue":
      return <RevenueTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "expenses":
      return <ExpensesTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "customers":
      return <CustomersTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "inventory":
      return <InventoryTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "projects":
      return <ProjectsTab extractArray={extractArray} extractNumber={extractNumber} />;
    case "ai_usage":
      return <AiUsageTab extractArray={extractArray} extractNumber={extractNumber} report={report} />;
    default:
      return null;
  }
}

function SalesTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalRevenue = extractNumber("totalRevenue");
  const invoiceCount = extractNumber("invoiceCount");
  const avgValue = extractNumber("avgInvoiceValue");
  const topCustomers = extractArray("topCustomers");
  const revenueByMonth = extractArray("revenueByMonth");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={DollarSign}
        />
        <StatCard
          title="Invoice Count"
          value={String(invoiceCount)}
          icon={FileText}
        />
        <StatCard
          title="Avg Invoice Value"
          value={formatCurrency(avgValue)}
          icon={BarChart3}
        />
      </div>

      {revenueByMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar
              items={revenueByMonth}
              labelKey="month"
              valueKey="revenue"
              color="bg-green-500"
            />
          </CardContent>
        </Card>
      )}

      {topCustomers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCustomers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{String(c.name)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.revenue) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function RevenueTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalRevenue = extractNumber("totalRevenue");
  const revenueBySource = extractArray("revenueBySource");
  const revenueByMonth = extractArray("revenueByMonth");

  return (
    <>
      <StatCard
        title="Total Revenue"
        value={formatCurrency(totalRevenue)}
        icon={TrendingUp}
      />
      {revenueByMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue by Month</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={revenueByMonth} labelKey="month" valueKey="revenue" color="bg-blue-500" />
          </CardContent>
        </Card>
      )}
      {revenueBySource.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={revenueBySource} labelKey="source" valueKey="revenue" color="bg-indigo-500" />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ExpensesTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalExpenses = extractNumber("totalExpenses");
  const byCategory = extractArray("byCategory");
  const byVendor = extractArray("byVendor");

  return (
    <>
      <StatCard
        title="Total Expenses"
        value={formatCurrency(totalExpenses)}
        icon={TrendingDown}
      />
      {byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expenses by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byCategory} labelKey="category" valueKey="amount" color="bg-red-500" />
          </CardContent>
        </Card>
      )}
      {byVendor.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expenses by Vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byVendor.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{String(v.vendor)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(v.amount) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function CustomersTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalCustomers = extractNumber("totalCustomers");
  const newThisMonth = extractNumber("newThisMonth");
  const topByRevenue = extractArray("topByRevenue");
  const byStatus = extractArray("byStatus");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Total Customers"
          value={String(totalCustomers)}
          icon={Users}
        />
        <StatCard
          title="New This Month"
          value={String(newThisMonth)}
          icon={TrendingUp}
        />
      </div>
      {byStatus.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customers by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byStatus} labelKey="status" valueKey="count" color="bg-violet-500" />
          </CardContent>
        </Card>
      )}
      {topByRevenue.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Customers by Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topByRevenue.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{String(c.name)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(c.revenue) || 0)}</TableCell>
                    <TableCell className="text-right">{String(c.invoiceCount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function InventoryTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalProducts = extractNumber("totalProducts");
  const totalValue = extractNumber("totalValue");
  const lowStockCount = extractNumber("lowStockCount");
  const topProducts = extractArray("topProducts");
  const byCategory = extractArray("byCategory");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Products" value={String(totalProducts)} icon={Package} />
        <StatCard title="Total Value" value={formatCurrency(totalValue)} icon={DollarSign} />
        <StatCard title="Low Stock Alerts" value={String(lowStockCount)} icon={TrendingDown} />
      </div>
      {byCategory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inventory by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byCategory} labelKey="category" valueKey="value" color="bg-amber-500" />
          </CardContent>
        </Card>
      )}
      {topProducts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top Products by Value</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{String(p.name)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(p.value) || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ProjectsTab({
  extractArray,
  extractNumber,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
}) {
  const totalProjects = extractNumber("totalProjects");
  const activeProjects = extractNumber("activeProjects");
  const completedProjects = extractNumber("completedProjects");
  const byStatus = extractArray("byStatus");
  const projectList = extractArray("projects");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Projects" value={String(totalProjects)} icon={FolderKanban} />
        <StatCard title="Active" value={String(activeProjects)} icon={TrendingUp} />
        <StatCard title="Completed" value={String(completedProjects)} icon={BarChart3} />
      </div>
      {byStatus.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Projects by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byStatus} labelKey="status" valueKey="count" color="bg-cyan-500" />
          </CardContent>
        </Card>
      )}
      {projectList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project List</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectList.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{String(p.name)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{String(p.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{String(p.progress)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function AiUsageTab({
  extractArray,
  extractNumber,
  report,
}: {
  extractArray: (key: string) => Record<string, unknown>[];
  extractNumber: (key: string) => number;
  report: ReportData;
}) {
  const totalTokens = extractNumber("totalTokens");
  const totalCost = extractNumber("totalCost");
  const totalRequests = extractNumber("totalRequests");
  const byModel = extractArray("byModel");
  const byDay = extractArray("byDay");

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Total Requests" value={String(totalRequests)} icon={Bot} />
        <StatCard title="Total Tokens" value={totalTokens.toLocaleString()} icon={BarChart3} />
        <StatCard title="Total Cost" value={formatCurrency(totalCost)} icon={DollarSign} />
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Generated {report.generatedAt}</CardTitle>
          <CardDescription>Report period: {report.periodStart ?? "N/A"} – {report.periodEnd ?? "N/A"}</CardDescription>
        </CardHeader>
      </Card>
      {byModel.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byModel} labelKey="model" valueKey="tokens" color="bg-purple-500" />
          </CardContent>
        </Card>
      )}
      {byDay.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daily Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBar items={byDay} labelKey="date" valueKey="tokens" color="bg-pink-500" />
          </CardContent>
        </Card>
      )}
    </>
  );
}
