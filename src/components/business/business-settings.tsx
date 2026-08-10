"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Building2, FileText, Bell, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getBusinessSettings,
  updateBusinessSettings,
} from "@/services/business-settings/actions";
import type { BusinessSettings } from "@/services/business-settings/actions";

// ── Constants ──────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "EUR", label: "EUR (€)", symbol: "€" },
  { value: "GBP", label: "GBP (£)", symbol: "£" },
  { value: "NGN", label: "NGN (₦)", symbol: "₦" },
];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (US)" },
  { value: "America/Chicago", label: "Central Time (US)" },
  { value: "America/Denver", label: "Mountain Time (US)" },
  { value: "America/Los_Angeles", label: "Pacific Time (US)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Asia/Shanghai", label: "Shanghai" },
  { value: "Asia/Kolkata", label: "Kolkata" },
  { value: "Africa/Lagos", label: "Lagos" },
];

const FISCAL_YEAR_OPTIONS = [
  { value: "01", label: "January" },
  { value: "04", label: "April" },
  { value: "07", label: "July" },
  { value: "10", label: "October" },
];

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_15", label: "Net 15" },
  { value: "net_30", label: "Net 30" },
  { value: "net_45", label: "Net 45" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
];

const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "card", label: "Credit/Debit Card" },
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "other", label: "Other" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface BusinessSettingsProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BusinessSettings({ workspaceId }: BusinessSettingsProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");

  const [general, setGeneral] = useState<NonNullable<BusinessSettings["general"]>>({});
  const [invoice, setInvoice] = useState<NonNullable<BusinessSettings["invoice"]>>({});
  const [notifications, setNotifications] = useState<NonNullable<BusinessSettings["notifications"]>>({});
  const [defaults, setDefaults] = useState<NonNullable<BusinessSettings["defaults"]>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const res = await getBusinessSettings(workspaceId);
    if (res.success && res.settings) {
      setGeneral(res.settings.general ?? {});
      setInvoice(res.settings.invoice ?? {});
      setNotifications(res.settings.notifications ?? {});
      setDefaults(res.settings.defaults ?? {});
      setWorkspaceName(res.workspaceName ?? "");
    } else {
      toast.error(res.message || "Failed to load settings");
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    const load = () => { void fetchSettings(); };
    load();
  }, [fetchSettings]);

  async function handleSave(section: "general" | "invoice" | "notifications" | "defaults", data: Record<string, unknown>) {
    setSaving(section);
    const res = await updateBusinessSettings(workspaceId, section, data);
    if (res.success) {
      toast.success("Settings saved");
    } else {
      toast.error(res.message || "Failed to save settings");
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Business Settings</h2>
        <p className="text-muted-foreground text-sm">Configure your workspace business preferences.</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="invoice" className="gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Invoice Settings</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="defaults" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Defaults</span>
          </TabsTrigger>
        </TabsList>

        {/* ── General Tab ─────────────────────────────────────────── */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Information</CardTitle>
              <CardDescription>Basic business details for your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Workspace Name</Label>
                <Input value={workspaceName} disabled className="max-w-md" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    value={general?.industry ?? ""}
                    onChange={(e) => setGeneral((prev) => ({ ...prev, industry: e.target.value }))}
                    placeholder="e.g. Technology, Consulting"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="currency">Default Currency</Label>
                  <Select
                    value={general?.currency ?? "USD"}
                    onValueChange={(v) => setGeneral((prev) => ({ ...prev, currency: v }))}
                  >
                    <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select
                    value={general?.timezone ?? "UTC"}
                    onValueChange={(v) => setGeneral((prev) => ({ ...prev, timezone: v }))}
                  >
                    <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fiscal-year">Fiscal Year Start</Label>
                  <Select
                    value={general.fiscalYearStart ?? "01"}
                    onValueChange={(v) => setGeneral((prev) => ({ ...prev, fiscalYearStart: v }))}
                  >
                    <SelectTrigger id="fiscal-year"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FISCAL_YEAR_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={() => handleSave("general", general)}
                disabled={saving === "general"}
              >
                {saving === "general" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save General Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invoice Settings Tab ────────────────────────────────── */}
        <TabsContent value="invoice">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Settings</CardTitle>
              <CardDescription>Configure default invoice behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <Label htmlFor="inv-terms">Default Invoice Terms</Label>
                  <Input
                    id="inv-terms"
                    value={invoice.defaultTerms ?? ""}
                    onChange={(e) => setInvoice((prev) => ({ ...prev, defaultTerms: e.target.value }))}
                    placeholder="e.g. Payment is due within 30 days"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="payment-terms">Payment Terms</Label>
                  <Select
                    value={invoice.paymentTerms ?? "net_30"}
                    onValueChange={(v) => setInvoice((prev) => ({ ...prev, paymentTerms: v }))}
                  >
                    <SelectTrigger id="payment-terms"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tax-rate">Default Tax Rate (%)</Label>
                  <Input
                    id="tax-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={invoice.taxRate ?? 0}
                    onChange={(e) => setInvoice((prev) => ({ ...prev, taxRate: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-prefix">Invoice Number Prefix</Label>
                  <Input
                    id="inv-prefix"
                    value={invoice.invoicePrefix ?? "INV"}
                    onChange={(e) => setInvoice((prev) => ({ ...prev, invoicePrefix: e.target.value }))}
                    placeholder="INV"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="auto-numbering"
                  checked={invoice.autoNumbering ?? true}
                  onCheckedChange={(checked) => setInvoice((prev) => ({ ...prev, autoNumbering: checked }))}
                />
                <Label htmlFor="auto-numbering">Auto-numbering for invoices</Label>
              </div>
              <Button
                onClick={() => handleSave("invoice", invoice)}
                disabled={saving === "invoice"}
              >
                {saving === "invoice" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Invoice Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notifications Tab ───────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notification Preferences</CardTitle>
              <CardDescription>Choose which business events trigger notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {(
                [
                  { key: "invoices" as const, label: "Invoice Events", desc: "Get notified about new, paid, and overdue invoices" },
                  { key: "contracts" as const, label: "Contract Events", desc: "Get notified about contract status changes and expirations" },
                  { key: "projects" as const, label: "Project Events", desc: "Get notified about project milestones, deadlines, and updates" },
                  { key: "expenses" as const, label: "Expense Events", desc: "Get notified about expense submissions and approvals" },
                ] as const
              ).map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-muted-foreground text-xs">{item.desc}</p>
                  </div>
                  <Switch
                    checked={notifications[item.key] ?? true}
                    onCheckedChange={(checked) =>
                      setNotifications((prev) => ({ ...prev, [item.key]: checked }))
                    }
                  />
                </div>
              ))}
              <Button
                onClick={() => handleSave("notifications", notifications)}
                disabled={saving === "notifications"}
              >
                {saving === "notifications" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Notification Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Defaults Tab ────────────────────────────────────────── */}
        <TabsContent value="defaults">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Default Values</CardTitle>
              <CardDescription>Set default values used when creating new records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <Label htmlFor="def-payment">Default Payment Method</Label>
                  <Select
                    value={defaults.defaultPaymentMethod ?? "bank_transfer"}
                    onValueChange={(v) => setDefaults((prev) => ({ ...prev, defaultPaymentMethod: v }))}
                  >
                    <SelectTrigger id="def-payment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="def-currency">Default Currency</Label>
                  <Select
                    value={defaults.defaultCurrency ?? "USD"}
                    onValueChange={(v) => setDefaults((prev) => ({ ...prev, defaultCurrency: v }))}
                  >
                    <SelectTrigger id="def-currency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="def-tax">Default Tax Rate (%)</Label>
                  <Input
                    id="def-tax"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={defaults.defaultTaxRate ?? 0}
                    onChange={(e) => setDefaults((prev) => ({ ...prev, defaultTaxRate: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <Button
                onClick={() => handleSave("defaults", defaults)}
                disabled={saving === "defaults"}
              >
                {saving === "defaults" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                Save Default Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
