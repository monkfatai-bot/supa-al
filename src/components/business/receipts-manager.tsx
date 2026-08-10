"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Loader2,
  Receipt,
  DollarSign,
  CalendarDays,
  FileText,
  Filter,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { getReceipts, createReceipt, voidReceipt, refundReceipt } from "@/services/receipt/actions";
import { getCustomers } from "@/services/crm";
import type { ReceiptWithInvoice } from "@/services/receipt/types";
import type { Customer } from "@/services/crm";
import type { PaymentMethod, ReceiptStatus } from "@/types/generated/database";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const STATUS_VARIANT: Record<ReceiptStatus, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  voided: "destructive",
  refunded: "secondary",
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Credit/Debit Card" },
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "other", label: "Other" },
];

const STATUS_FILTERS = ["all", "active", "voided", "refunded"];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReceiptsManagerProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ReceiptsManager({ workspaceId }: ReceiptsManagerProps) {
  // List state
  const [receipts, setReceipts] = useState<ReceiptWithInvoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Customers
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newReceipt, setNewReceipt] = useState({
    customerId: "",
    amount: "",
    paymentMethod: "bank_transfer" as PaymentMethod,
    notes: "",
    paymentReference: "",
  });

  // Detail dialog
  const [detailReceipt, setDetailReceipt] = useState<ReceiptWithInvoice | null>(null);

  // Void dialog
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  // Refund dialog
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundId, setRefundId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

  // ── Computed stats ───────────────────────────────────────────────────
  const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0);
  const activeReceipts = receipts.filter((r) => r.status === "active");
  const activeTotal = activeReceipts.reduce((sum, r) => sum + r.amount, 0);
  const now = new Date();
  const thisMonthReceipts = receipts.filter((r) => {
    const d = new Date(r.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && r.status === "active";
  });
  const thisMonthTotal = thisMonthReceipts.reduce((sum, r) => sum + r.amount, 0);

  // Spending by payment method
  const byPaymentMethod = activeReceipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.payment_method] = (acc[r.payment_method] ?? 0) + r.amount;
    return acc;
  }, {});

  // ── Fetch ───────────────────────────────────────────────────────────
  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getReceipts(workspaceId, {
        page,
        pageSize,
        search: search || undefined,
      });
      setReceipts(res.receipts);
      setTotalCount(res.total);
    } catch {
      toast.error("Failed to load receipts");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, search]);

  const fetchCustomers = useCallback(() => {
    getCustomers({ workspaceId, pageSize: 200 }).then((res) => {
      if (res.success && res.data) setCustomers(res.data);
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    void fetchReceipts();
  }, [fetchReceipts]);

  // ── Client-side filter (for status and payment method) ──────────────
  const filteredReceipts = receipts.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (paymentFilter !== "all" && r.payment_method !== paymentFilter) return false;
    if (dateFrom && r.created_at < dateFrom) return false;
    if (dateTo && r.created_at > dateTo + "T23:59:59") return false;
    return true;
  });

  // ── Create ─────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newReceipt.customerId || !newReceipt.amount) {
      toast.error("Customer and amount are required");
      return;
    }
    setCreating(true);
    try {
      const res = await createReceipt({
        workspaceId,
        customerId: newReceipt.customerId,
        amount: parseFloat(newReceipt.amount),
        paymentMethod: newReceipt.paymentMethod,
        notes: newReceipt.notes || undefined,
        paymentReference: newReceipt.paymentReference || undefined,
      });
      if (res.success) {
        toast.success("Receipt created");
        setCreateDialogOpen(false);
        setNewReceipt({
          customerId: "",
          amount: "",
          paymentMethod: "bank_transfer",
          notes: "",
          paymentReference: "",
        });
        fetchReceipts();
      } else {
        toast.error(res.message || "Failed to create receipt");
      }
    } catch {
      toast.error("Failed to create receipt");
    } finally {
      setCreating(false);
    }
  }

  // ── Void ───────────────────────────────────────────────────────────
  async function handleVoid() {
    if (!detailReceipt) return;
    setVoiding(true);
    try {
      const res = await voidReceipt(detailReceipt.id);
      if (res.success) {
        toast.success("Receipt voided");
        setVoidDialogOpen(false);
        setDetailReceipt(null);
        fetchReceipts();
      } else {
        toast.error(res.message || "Failed to void receipt");
      }
    } catch {
      toast.error("Failed to void receipt");
    } finally {
      setVoiding(false);
    }
  }

  // ── Refund ─────────────────────────────────────────────────────────
  function openRefundDialog(id: string) {
    setRefundId(id);
    setRefundReason("");
    setRefundDialogOpen(true);
  }

  async function handleRefund() {
    if (!refundId || !refundReason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setRefunding(true);
    try {
      const res = await refundReceipt(refundId, refundReason.trim());
      if (res.success) {
        toast.success("Receipt refunded");
        setRefundDialogOpen(false);
        if (detailReceipt?.id === refundId) setDetailReceipt(null);
        fetchReceipts();
      } else {
        toast.error(res.message || "Failed to refund");
      }
    } catch {
      toast.error("Failed to refund");
    } finally {
      setRefunding(false);
    }
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Receipts</h2>
          <p className="text-muted-foreground text-sm">Track payments and manage receipts.</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" /> New Receipt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Receipt</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="rc-customer">Customer *</Label>
                <Select
                  value={newReceipt.customerId}
                  onValueChange={(v) => setNewReceipt((r) => ({ ...r, customerId: v }))}
                >
                  <SelectTrigger id="rc-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="rc-amount">Amount *</Label>
                  <Input
                    id="rc-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={newReceipt.amount}
                    onChange={(e) => setNewReceipt((r) => ({ ...r, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rc-method">Payment Method</Label>
                  <Select
                    value={newReceipt.paymentMethod}
                    onValueChange={(v) => setNewReceipt((r) => ({ ...r, paymentMethod: v as PaymentMethod }))}
                  >
                    <SelectTrigger id="rc-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rc-ref">Payment Reference</Label>
                <Input
                  id="rc-ref"
                  placeholder="Transaction ID or reference"
                  value={newReceipt.paymentReference}
                  onChange={(e) => setNewReceipt((r) => ({ ...r, paymentReference: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rc-notes">Notes</Label>
                <Textarea
                  id="rc-notes"
                  placeholder="Optional notes..."
                  rows={2}
                  value={newReceipt.notes}
                  onChange={(e) => setNewReceipt((r) => ({ ...r, notes: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={creating || !newReceipt.customerId || !newReceipt.amount}
              >
                {creating ? "Creating..." : "Create Receipt"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receipts</CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">{totalCount}</div>
                <p className="text-xs text-muted-foreground">{formatCurrency(totalAmount)} total</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Amount</CardTitle>
            <DollarSign className="text-emerald-600 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(activeTotal)}</div>
                <p className="text-xs text-muted-foreground">{activeReceipts.length} active</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <CalendarDays className="text-amber-600 h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(thisMonthTotal)}</div>
                <p className="text-xs text-muted-foreground">{thisMonthReceipts.length} receipts</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">By Payment Method</CardTitle>
            <Receipt className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <div className="space-y-1">
                {Object.entries(byPaymentMethod)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 2)
                  .map(([method, amount]) => (
                    <div key={method} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{method.replace(/_/g, " ")}</span>
                      <span className="font-medium">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                {Object.keys(byPaymentMethod).length === 0 && (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spending by Payment Method Chart */}
      {!loading && Object.entries(byPaymentMethod).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Receipts by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(byPaymentMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => {
                  const pct = activeTotal > 0 ? (amount / activeTotal) * 100 : 0;
                  return (
                    <div key={method} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{method.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground">{formatCurrency(amount)} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Payment Method" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Receipts Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Receipts ({filteredReceipts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="py-12 text-center">
              <Receipt className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
              <p className="text-muted-foreground text-sm">No receipts found.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceipts.map((receipt) => {
                      return (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-medium font-mono text-sm">
                            {receipt.receipt_number}
                          </TableCell>
                          <TableCell className="font-medium">{formatCurrency(receipt.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs capitalize">{receipt.payment_method.replace(/_/g, " ")}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {receipt.invoice?.invoice_number ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[receipt.status]}>{receipt.status}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDateShort(receipt.created_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setDetailReceipt(receipt)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {receipt.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-600 hover:text-amber-700"
                                  onClick={() => openRefundDialog(receipt.id)}
                                >
                                  Refund
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
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailReceipt} onOpenChange={(open) => { if (!open) setDetailReceipt(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>
          {detailReceipt && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Receipt #</p>
                  <p className="font-mono text-sm font-medium">{detailReceipt.receipt_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Status</p>
                  <Badge variant={STATUS_VARIANT[detailReceipt.status]}>{detailReceipt.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Amount</p>
                  <p className="text-lg font-bold">{formatCurrency(detailReceipt.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Payment Method</p>
                  <p className="text-sm capitalize">{detailReceipt.payment_method.replace(/_/g, " ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Invoice</p>
                  <p className="text-sm">{detailReceipt.invoice?.invoice_number ?? "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Created</p>
                  <p className="text-sm">{formatDate(detailReceipt.created_at)}</p>
                </div>
              </div>
              {detailReceipt.payment_reference && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Payment Reference</p>
                  <p className="font-mono text-sm">{detailReceipt.payment_reference}</p>
                </div>
              )}
              {detailReceipt.notes && (
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Notes</p>
                  <p className="text-sm">{detailReceipt.notes}</p>
                </div>
              )}
              <Separator />
              {detailReceipt.status === "active" && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-amber-600 hover:bg-amber-50"
                    onClick={() => { setRefundId(detailReceipt.id); setRefundReason(""); setRefundDialogOpen(true); }}
                  >
                    Refund
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => { setVoidDialogOpen(true); }}
                  >
                    Void Receipt
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Void Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">Are you sure you want to void this receipt? This action cannot be undone.</p>
            <Button className="w-full" variant="destructive" onClick={handleVoid} disabled={voiding}>
              {voiding ? "Voiding..." : "Void Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Refund Receipt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-muted-foreground text-sm">Please provide a reason for the refund.</p>
            <Textarea
              placeholder="Reason for refund..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
            />
            <Button className="w-full" variant="destructive" onClick={handleRefund} disabled={refunding || !refundReason.trim()}>
              {refunding ? "Processing..." : "Confirm Refund"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
