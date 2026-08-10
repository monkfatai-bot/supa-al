"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Clock,
  Tag,
  Plus,
  Search,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Banknote,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createExpense,
  getExpenses,
  approveExpense,
  rejectExpense,
  reimburseExpense,
  aiCategorizeExpense,
  getExpenseStats,
  getExpenseCategories,
} from "@/services/expense";
import type {
  ExpenseWithBudget,
  ExpenseDashboardStats,
} from "@/services/expense";

interface ExpenseTrackerProps {
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  reimbursed: "outline",
};

export function ExpenseTracker({ workspaceId }: ExpenseTrackerProps) {
  // Stats
  const [stats, setStats] = useState<ExpenseDashboardStats | null>(null);

  // List
  const [expenses, setExpenses] = useState<ExpenseWithBudget[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 15;

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Categories
  const [categories, setCategories] = useState<string[]>([]);

  // Add expense dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    category: "",
    vendor: "",
    date: new Date().toISOString().split("T")[0],
    tags: "",
  });
  const [creating, setCreating] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Reimburse dialog
  const [reimburseDialogOpen, setReimburseDialogOpen] = useState(false);
  const [reimburseId, setReimburseId] = useState<string | null>(null);
  const [reimburseTo, setReimburseTo] = useState("");
  const [reimbursing, setReimbursing] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const fetchStats = useCallback(async () => {
    try {
      const res = await getExpenseStats(workspaceId);
      if (res.success && res.stats) setStats(res.stats);
    } catch {
      toast.error("Failed to load expense stats");
    }
  }, [workspaceId]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await getExpenseCategories(workspaceId);
      if (res.success && res.categories) setCategories(res.categories);
    } catch {
      toast.error("Failed to load expense categories");
    }
  }, [workspaceId]);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getExpenses(workspaceId, {
        page,
        pageSize,
        search: search || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setExpenses(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, search, categoryFilter, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchStats();
    fetchCategories();
  }, [fetchStats, fetchCategories]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  async function handleCreateExpense() {
    if (!newExpense.description.trim() || !newExpense.amount || !newExpense.category) {
      toast.error("Description, amount, and category are required");
      return;
    }
    setCreating(true);
    try {
      const tags = newExpense.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await createExpense({
        workspaceId,
        description: newExpense.description.trim(),
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
        vendor: newExpense.vendor || undefined,
        expenseDate: newExpense.date || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });
      if (res.success) {
        toast.success("Expense created");
        setAddDialogOpen(false);
        setNewExpense({
          description: "",
          amount: "",
          category: "",
          vendor: "",
          date: new Date().toISOString().split("T")[0],
          tags: "",
        });
        fetchExpenses();
        fetchStats();
      } else {
        toast.error(res.message || "Failed to create expense");
      }
    } catch {
      toast.error("Failed to create expense");
    } finally {
      setCreating(false);
    }
  }

  async function handleAiCategorize() {
    if (!newExpense.description.trim()) {
      toast.error("Enter a description first");
      return;
    }
    setAiSuggesting(true);
    try {
      const res = await aiCategorizeExpense({
        description: newExpense.description,
        vendor: newExpense.vendor || undefined,
        amount: parseFloat(newExpense.amount) || 0,
      });
      if (res.success && res.result) {
        setNewExpense((e) => ({ ...e, category: res.result!.category }));
        toast.success(`Suggested: ${res.result.category} (${Math.round(res.result.confidence * 100)}% confidence)`);
      } else {
        toast.error(res.message || "AI categorization failed");
      }
    } catch {
      toast.error("AI categorization failed");
    } finally {
      setAiSuggesting(false);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading((prev) => new Set(prev).add(id));
    try {
      const res = await approveExpense(id);
      if (res.success) {
        toast.success("Expense approved");
        fetchExpenses();
        fetchStats();
      } else {
        toast.error(res.message || "Failed to approve");
      }
    } catch {
      toast.error("Failed to approve");
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function openRejectDialog(id: string) {
    setRejectId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  }

  async function handleReject() {
    if (!rejectId || !rejectReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setRejecting(true);
    try {
      const res = await rejectExpense(rejectId, rejectReason.trim());
      if (res.success) {
        toast.success("Expense rejected");
        setRejectDialogOpen(false);
        fetchExpenses();
        fetchStats();
      } else {
        toast.error(res.message || "Failed to reject");
      }
    } catch {
      toast.error("Failed to reject");
    } finally {
      setRejecting(false);
    }
  }

  function openReimburseDialog(id: string) {
    setReimburseId(id);
    setReimburseTo("");
    setReimburseDialogOpen(true);
  }

  async function handleReimburse() {
    if (!reimburseId || !reimburseTo.trim()) {
      toast.error("Reimburse to is required");
      return;
    }
    const expense = expenses.find((e) => e.id === reimburseId);
    if (!expense) return;
    setReimbursing(true);
    try {
      const res = await reimburseExpense(reimburseId, {
        reimbursedTo: reimburseTo.trim(),
        amount: expense.amount,
      });
      if (res.success) {
        toast.success("Expense marked as reimbursed");
        setReimburseDialogOpen(false);
        fetchExpenses();
        fetchStats();
      } else {
        toast.error(res.message || "Failed to reimburse");
      }
    } catch {
      toast.error("Failed to reimburse");
    } finally {
      setReimbursing(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);
  const topCategory =
    stats?.byCategory && stats.byCategory.length > 0
      ? stats.byCategory.reduce((a, b) => (a.amount > b.amount ? a : b)).category
      : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expense Tracker</h1>
          <p className="text-muted-foreground text-sm">Track, approve, and reimburse expenses.</p>
        </div>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Expense</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="exp-desc">Description *</Label>
                <Textarea
                  id="exp-desc"
                  placeholder="Lunch with client at restaurant"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense((ex) => ({ ...ex, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="exp-amount">Amount *</Label>
                  <Input
                    id="exp-amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense((ex) => ({ ...ex, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="exp-cat">Category *</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={handleAiCategorize}
                      disabled={aiSuggesting}
                    >
                      {aiSuggesting ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-3 w-3" />
                      )}
                      AI Categorize
                    </Button>
                  </div>
                  {categories.length > 0 ? (
                    <Select
                      value={newExpense.category}
                      onValueChange={(v) => setNewExpense((ex) => ({ ...ex, category: v }))}
                    >
                      <SelectTrigger className="h-9" id="exp-cat">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="exp-cat"
                      placeholder="e.g. Meals"
                      value={newExpense.category}
                      onChange={(e) => setNewExpense((ex) => ({ ...ex, category: e.target.value }))}
                      className="h-9"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="exp-vendor">Vendor</Label>
                  <Input
                    id="exp-vendor"
                    placeholder="Vendor name"
                    value={newExpense.vendor}
                    onChange={(e) => setNewExpense((ex) => ({ ...ex, vendor: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="exp-date">Date</Label>
                  <Input
                    id="exp-date"
                    type="date"
                    value={newExpense.date}
                    onChange={(e) => setNewExpense((ex) => ({ ...ex, date: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="exp-tags">Tags (comma-separated)</Label>
                <Input
                  id="exp-tags"
                  placeholder="travel, client-meeting"
                  value={newExpense.tags}
                  onChange={(e) => setNewExpense((ex) => ({ ...ex, tags: e.target.value }))}
                  className="h-9"
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreateExpense}
                disabled={
                  creating ||
                  !newExpense.description.trim() ||
                  !newExpense.amount ||
                  !newExpense.category
                }
              >
                {creating ? "Creating..." : "Create Expense"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="bg-green-500/10 text-green-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <DollarSign className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">This Month</p>
              <p className="text-xl font-bold tracking-tight">{formatCurrency(stats?.totalThisMonth ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="bg-amber-500/10 text-amber-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Pending</p>
              <p className="text-xl font-bold tracking-tight">
                {stats?.pendingCount ?? 0} ({formatCurrency(stats?.pendingAmount ?? 0)})
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="bg-blue-500/10 text-blue-600 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg">
              <Tag className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Top Category</p>
              <p className="text-xl font-bold tracking-tight">{topCategory}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">Filters</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="reimbursed">Reimbursed</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-9"
              placeholder="From"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-9"
              placeholder="To"
            />
          </div>
        </CardContent>
      </Card>

      {/* Expense Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Expenses ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : expenses.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No expenses found.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => {
                      const canApprove = expense.status === "pending";
                      const canReject = expense.status === "pending";
                      const canReimburse = expense.status === "approved";
                      const isLoading = actionLoading.has(expense.id);
                      return (
                        <TableRow key={expense.id}>
                          <TableCell className="max-w-[200px] truncate font-medium">
                            {expense.description}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {expense.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(expense.amount)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {expense.vendor || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(expense.expense_date)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[expense.status] || "secondary"}>
                              {expense.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canApprove && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-green-600 hover:text-green-700"
                                  onClick={() => handleApprove(expense.id)}
                                  disabled={isLoading}
                                >
                                  {isLoading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1">Approve</span>
                                </Button>
                              )}
                              {canReject && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-red-600 hover:text-red-700"
                                  onClick={() => openRejectDialog(expense.id)}
                                  disabled={isLoading}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  <span className="ml-1">Reject</span>
                                </Button>
                              )}
                              {canReimburse && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-blue-600 hover:text-blue-700"
                                  onClick={() => openReimburseDialog(expense.id)}
                                  disabled={isLoading}
                                >
                                  <Banknote className="h-3.5 w-3.5" />
                                  <span className="ml-1">Reimburse</span>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-muted-foreground text-xs">Page {page} of {totalPages}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">Please provide a reason for rejection.</p>
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <Button className="w-full" variant="destructive" onClick={handleReject} disabled={rejecting || !rejectReason.trim()}>
              {rejecting ? "Rejecting..." : "Reject Expense"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reimburse Dialog */}
      <Dialog open={reimburseDialogOpen} onOpenChange={setReimburseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reimburse Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="reimb-to">Reimburse to (user ID or email)</Label>
              <Input
                id="reimb-to"
                placeholder="user@example.com"
                value={reimburseTo}
                onChange={(e) => setReimburseTo(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleReimburse} disabled={reimbursing || !reimburseTo.trim()}>
              {reimbursing ? "Processing..." : "Confirm Reimbursement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
