"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — Invoices view.
 *
 * The invoice list surface. Composes:
 *
 *   - A search input (debounced via React's `useDeferredValue`) that
 *     matches invoice number + customer name server-side.
 *   - A status filter dropdown (`draft`, `sent`, `paid`, `overdue`, …).
 *   - A "New invoice" button that opens a creation dialog (customer
 *     placeholder, currency, status, due date, line items).
 *   - A responsive invoice table showing number, customer, issue / due
 *     date, status, and total. Each status badge is color-coded.
 *
 * The view is purely presentational on top of {@link useInvoices} +
 * {@link useCreateInvoice} from {@link @/hooks/use-business}.
 *
 * @module @/components/business/invoice-view
 */
import * as React from "react";
import { FileText, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Invoice, InvoiceStatus } from "@/lib/business/client";
import {
  useCreateInvoice,
  useInvoices,
} from "@/hooks/use-business";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils/index";

/** Invoice-status → badge palette. */
const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
  viewed:
    "border-transparent bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  partial:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  paid: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  overdue:
    "border-transparent bg-destructive/10 text-destructive dark:text-red-400",
  void: "border-transparent bg-muted text-muted-foreground line-through",
  cancelled:
    "border-transparent bg-muted text-muted-foreground line-through",
};

const STATUS_OPTIONS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
  { value: "cancelled", label: "Cancelled" },
];

export interface InvoiceViewProps {
  workspaceId: string;
  className?: string;
}

export function InvoiceView({ workspaceId, className }: InvoiceViewProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<InvoiceStatus | "all">("all");
  const debouncedSearch = React.useDeferredValue(search);

  const invoicesQuery = useInvoices(workspaceId, {
    search: debouncedSearch || undefined,
    status: status === "all" ? undefined : status,
    limit: 100,
  });

  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className={cn("space-y-4 p-4 sm:p-6 lg:p-8", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Invoices
          </h2>
          <p className="text-sm text-muted-foreground">
            Track billing — drafts, sent, viewed, partial, paid, and overdue.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="size-4" /> New invoice
        </Button>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search by invoice number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search invoices"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as InvoiceStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {invoicesQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : invoicesQuery.isError ? (
        <EmptyState
          icon={FileText}
          title="Couldn't load invoices"
          description="Please try again later."
        />
      ) : (invoicesQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="Create your first invoice to start tracking billing and payments."
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="size-4" /> Create invoice
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoicesQuery.data ?? []).map((inv) => (
                <InvoiceRow key={inv.id} invoice={inv} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{invoice.number}</TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(invoice.issue_date)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {invoice.due_date ? formatDate(invoice.due_date) : "—"}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("capitalize", STATUS_BADGE[invoice.status as InvoiceStatus] ?? "")}
        >
          {invoice.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(invoice.total, invoice.currency)}
      </TableCell>
    </TableRow>
  );
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const [status, setStatus] = React.useState<InvoiceStatus>("draft");
  const [currency, setCurrency] = React.useState("USD");
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const mutation = useCreateInvoice();
  const { toast } = useToast();

  const reset = React.useCallback(() => {
    setStatus("draft");
    setCurrency("USD");
    setDueDate("");
    setNotes("");
  }, []);

  const handleSubmit = React.useCallback(async () => {
    try {
      await mutation.mutateAsync({
        workspaceId,
        input: {
          status,
          currency,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
        },
      });
      toast({ title: "Invoice created" });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to create invoice",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [
    currency,
    dueDate,
    mutation,
    notes,
    onOpenChange,
    reset,
    status,
    toast,
    workspaceId,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" /> New invoice
          </DialogTitle>
          <DialogDescription>
            Create a draft invoice. The system will assign an invoice number
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as InvoiceStatus)}
              >
                <SelectTrigger id="inv-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-currency">Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="inv-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="JPY">JPY</SelectItem>
                  <SelectItem value="AUD">AUD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-due">Due date</Label>
            <Input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-notes">Notes</Label>
            <Input
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment instructions"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
