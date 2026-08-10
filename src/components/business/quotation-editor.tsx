"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  Send,
  ArrowRightLeft,
  AlertCircle,
  Loader2,
  Sparkles,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createQuotation,
  updateQuotation,
  deleteQuotation,
  updateQuotationStatus,
  getQuotation,
  convertQuotationToInvoice,
} from "@/services/quotation";
import { getCustomers } from "@/services/crm";
import { createQuotationWithAi } from "@/services/business-assistant";
import type {
  QuotationItemList,
  QuotationWithItems,
} from "@/services/quotation";
import type { Customer } from "@/services/crm";
import type { BusinessAssistantResponse } from "@/services/business-assistant";

// ── Constants ──────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
  { value: "NGN", label: "NGN (₦)", symbol: "₦" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  sent: "default",
  accepted: "secondary",
  rejected: "destructive",
  expired: "destructive",
  converted: "secondary",
};

interface LineItemForm {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  discountPercent: number;
}

function emptyLineItem(): LineItemForm {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unitPrice: 0,
    taxRate: 0,
    discountPercent: 0,
  };
}

function calcLineTotal(item: LineItemForm): number {
  const base = item.quantity * item.unitPrice;
  const tax = base * (item.taxRate / 100);
  const discount = base * (item.discountPercent / 100);
  return base + tax - discount;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuotationEditorProps {
  workspaceId: string;
  quotationId?: string;
  customerId?: string;
  onSaved?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function QuotationEditor({
  workspaceId,
  quotationId,
  customerId: initialCustomerId,
  onSaved,
}: QuotationEditorProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [quotation, setQuotation] = useState<QuotationWithItems | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [lineItems, setLineItems] = useState<LineItemForm[]>([emptyLineItem()]);

  const [loading, setLoading] = useState(!!quotationId);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiRequirements, setAiRequirements] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // ── Derived calculations ────────────────────────────────────────────────
  const currencySymbol = CURRENCIES.find((c) => c.value === currency)?.symbol ?? "$";

  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const totalTax = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice * (item.taxRate / 100),
    0
  );
  const totalDiscount = lineItems.reduce(
    (sum, item) =>
      sum + item.quantity * item.unitPrice * (item.discountPercent / 100),
    0
  );
  const total = subtotal + totalTax - totalDiscount;

  // ── Fetch customers ─────────────────────────────────────────────────────
  const fetchCustomers = useCallback(() => {
    getCustomers({ workspaceId, pageSize: 200 }).then((res) => {
      if (res.success && res.data) setCustomers(res.data);
    });
  }, [workspaceId]);

  // ── Fetch existing quotation ─────────────────────────────────────────────
  const fetchQuotation = useCallback(() => {
    if (!quotationId) return;
    setLoading(true);
    getQuotation(quotationId).then((data) => {
      if (data) {
        setQuotation(data);
        setSelectedCustomerId(data.customer_id);
        setValidUntil(data.valid_until?.split("T")[0] ?? "");
        setCurrency(data.currency);
        setNotes(data.notes);
        setTerms(data.terms);
        if (data.items && data.items.length > 0) {
          setLineItems(
            data.items.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              taxRate: item.tax_rate,
              discountPercent: item.discount_percent,
            }))
          );
        }
      }
      setLoading(false);
    });
  }, [quotationId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQuotation();
  }, [fetchQuotation]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialCustomerId) setSelectedCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  // ── Line item helpers ────────────────────────────────────────────────────
  function addLineItem() {
    setLineItems((prev) => [...prev, emptyLineItem()]);
  }

  function removeLineItem(id: string) {
    setLineItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((item) => item.id !== id);
    });
  }

  function updateLineItem(id: string, field: keyof LineItemForm, value: string | number) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  // ── Build items payload ─────────────────────────────────────────────────
  function buildItemsPayload(): QuotationItemList[] {
    return lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate: item.taxRate,
      discountPercent: item.discountPercent,
      total: calcLineTotal(item),
    }));
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedCustomerId) {
      setError("Please select a customer.");
      return;
    }

    const hasDescription = lineItems.some((item) => item.description.trim());
    if (!hasDescription) {
      setError("Add at least one item with a description.");
      return;
    }

    setSaving(true);
    setError("");

    const items = buildItemsPayload();

    if (quotationId && quotation) {
      const res = await updateQuotation(quotationId, {
        customer_id: selectedCustomerId,
        valid_until: validUntil || null,
        currency,
        notes,
        terms,
        subtotal,
        tax_rate: 0,
        tax_amount: totalTax,
        discount_amount: totalDiscount,
        total,
      } as Record<string, unknown>);

      if (res.error) {
        setError(res.error);
      } else {
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
        onSaved?.();
      }
    } else {
      const res = await createQuotation({
        workspaceId,
        customerId: selectedCustomerId,
        validUntil: validUntil || undefined,
        currency,
        notes,
        terms,
        items,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.quotation) {
        setQuotation(res.quotation as QuotationWithItems);
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
        onSaved?.();
      }
    }

    setSaving(false);
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!quotationId) {
      await handleSave();
      return;
    }
    setSending(true);
    setError("");
    const res = await updateQuotationStatus(quotationId, "sent");
    if (res.error) {
      setError(res.error);
    } else {
      setQuotation((prev) => (prev ? { ...prev, status: "sent" as const } : prev));
      onSaved?.();
    }
    setSending(false);
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!quotationId) return;
    if (!confirm("Are you sure you want to delete this quotation?")) return;
    setDeleting(true);
    const res = await deleteQuotation(quotationId);
    if (res.error) {
      setError(res.error);
    }
    setDeleting(false);
    onSaved?.();
  }

  // ── Convert to Invoice ───────────────────────────────────────────────────
  async function handleConvert() {
    if (!quotationId) return;
    if (!confirm("Convert this quotation to an invoice? The quotation will be marked as converted.")) return;
    setConverting(true);
    setError("");
    const res = await convertQuotationToInvoice(quotationId);
    if (res.error) {
      setError(res.error);
    } else {
      setQuotation((prev) => (prev ? { ...prev, status: "converted" as const } : prev));
      onSaved?.();
    }
    setConverting(false);
  }

  // ── AI Generate ──────────────────────────────────────────────────────────
  async function handleAiGenerate() {
    if (!aiRequirements.trim()) {
      setError("Please enter customer requirements for AI generation.");
      return;
    }

    const customerName =
      customers.find((c) => c.id === selectedCustomerId)?.name ?? "Customer";
    const requirements = aiRequirements
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    setAiLoading(true);
    setError("");

    const res: BusinessAssistantResponse = await createQuotationWithAi(
      workspaceId,
      { customerName, requirements }
    );

    if (res.success && res.metadata?.generatedQuotation) {
      const generated = res.metadata.generatedQuotation as Record<
        string,
        unknown
      >;
      const generatedItems = generated.items as Array<Record<string, unknown>>;

      if (Array.isArray(generatedItems)) {
        setLineItems(
          generatedItems.map((item) => ({
            id: crypto.randomUUID(),
            description: String(item.description ?? ""),
            quantity: Number(item.quantity ?? 1),
            unitPrice: Number(item.unitPrice ?? 0),
            taxRate: Number(item.taxRate ?? 0),
            discountPercent: Number(item.discountPercent ?? 0),
          }))
        );
      }

      if (typeof generated.terms === "string") {
        setTerms(generated.terms);
      }
      if (typeof generated.notes === "string") {
        setNotes(generated.notes);
      }

      setAiDialogOpen(false);
      setAiRequirements("");
    } else {
      setError(res.error ?? "AI generation failed.");
    }

    setAiLoading(false);
  }

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-xl font-semibold">
            {quotation
              ? `Quotation ${quotation.quote_number}`
              : "New Quotation"}
          </h2>
          {quotation && (
            <Badge variant={STATUS_VARIANT[quotation.status] ?? "outline"}>
              {quotation.status.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {saving ? "Saving..." : saveStatus ? `✓ ${saveStatus}` : ""}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Main form card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1.5 block text-sm font-medium">Customer</label>
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Valid Until
              </label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Currency</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes for the customer..."
                rows={3}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Terms</label>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Quotation terms and conditions..."
                rows={3}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Line Items</CardTitle>
            <Button variant="outline" size="sm" onClick={addLineItem}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table Header */}
          <div className="mb-2 hidden gap-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[1fr_80px_100px_80px_80px_100px_40px]">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-right">Tax %</span>
            <span className="text-right">Disc %</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            {lineItems.map((item) => {
              const lineTotal = calcLineTotal(item);
              return (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border p-3 md:grid md:grid-cols-[1fr_80px_100px_80px_80px_100px_40px] md:items-center md:gap-3 md:p-2"
                >
                  <div className="md:col-span-1">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
                      Description
                    </label>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(item.id, "description", e.target.value)
                      }
                      placeholder="Item description"
                      className="h-9"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
                      Quantity
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(
                          item.id,
                          "quantity",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-9 text-right"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
                      Unit Price
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) =>
                        updateLineItem(
                          item.id,
                          "unitPrice",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-9 text-right"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
                      Tax %
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={item.taxRate}
                      onChange={(e) =>
                        updateLineItem(
                          item.id,
                          "taxRate",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-9 text-right"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground md:hidden">
                      Discount %
                    </label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={item.discountPercent}
                      onChange={(e) =>
                        updateLineItem(
                          item.id,
                          "discountPercent",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="h-9 text-right"
                    />
                  </div>

                  <div className="flex items-center justify-end">
                    <span className="text-sm font-medium tabular-nums">
                      {currencySymbol}
                      {lineTotal.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLineItem(item.id)}
                      disabled={lineItems.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          {/* Summary */}
          <div className="flex flex-col items-end gap-2">
            <div className="flex w-full max-w-xs justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">
                {currencySymbol}{subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex w-full max-w-xs justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">
                {currencySymbol}{totalTax.toFixed(2)}
              </span>
            </div>
            <div className="flex w-full max-w-xs justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums text-green-600">
                -{currencySymbol}{totalDiscount.toFixed(2)}
              </span>
            </div>
            <Separator className="my-1 w-full max-w-xs" />
            <div className="flex w-full max-w-xs justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {currencySymbol}{total.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Action Bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {lineItems.length} item{lineItems.length !== 1 ? "s" : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          {quotationId && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-4 w-4" />
              )}
              Delete
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            Save Draft
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSend}
            disabled={sending || !selectedCustomerId}
          >
            {sending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            Send Quotation
          </Button>

          {quotationId && quotation?.status !== "converted" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConvert}
              disabled={converting}
            >
              {converting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-1.5 h-4 w-4" />
              )}
              Convert to Invoice
            </Button>
          )}

          {/* AI Generate Dialog */}
          <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={aiLoading}>
                {aiLoading ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                AI Generate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI-Generated Quotation</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Describe the customer&apos;s requirements, one per line. The AI
                  will generate line items with realistic pricing.
                </p>
                <Textarea
                  value={aiRequirements}
                  onChange={(e) => setAiRequirements(e.target.value)}
                  placeholder={"e.g.\nWebsite redesign with 10 pages\nSEO optimization for 6 months\nLogo design and brand guidelines"}
                  rows={6}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAiDialogOpen(false)}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAiGenerate}
                    disabled={aiLoading || !aiRequirements.trim()}
                  >
                    {aiLoading ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    Generate
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
