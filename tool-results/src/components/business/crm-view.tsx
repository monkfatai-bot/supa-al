"use client";

/**
 * Supa AI — Phase 10 Business AI Suite — CRM view.
 *
 * The customer list surface. Composes:
 *
 *   - A search input (debounced via React's `useDeferredValue`) that
 *     matches name, email, phone, company server-side.
 *   - A status filter dropdown (`active`, `lead`, `inactive`, …).
 *   - A "New customer" button that opens a small creation dialog
 *     (name + email + phone + company + status).
 *   - A responsive grid of customer cards. Each card shows the
 *     customer name, status badge, email, phone, company, tags, and
 *     created-at date.
 *
 * The view is purely presentational on top of {@link useCustomers} +
 * {@link useCreateCustomer} from {@link @/hooks/use-business}. All
 * workspace scoping comes from the parent `BusinessView` (the
 * `workspaceId` prop is required).
 *
 * @module @/components/business/crm-view
 */
import * as React from "react";
import {
  Briefcase,
  Building2,
  Mail,
  Phone,
  Plus,
  Search,
  User,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Customer, CustomerStatus } from "@/lib/business/client";
import {
  useCreateCustomer,
  useCustomers,
} from "@/hooks/use-business";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { formatDate } from "@/lib/utils/index";

/** Customer-status → badge palette. */
const STATUS_BADGE: Record<CustomerStatus, string> = {
  active: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  inactive: "border-transparent bg-muted text-muted-foreground",
  lead: "border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300",
  archived:
    "border-transparent bg-muted text-muted-foreground line-through",
  blacklisted:
    "border-transparent bg-destructive/10 text-destructive dark:text-red-400",
};

const STATUS_OPTIONS: { value: CustomerStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "lead", label: "Lead" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "blacklisted", label: "Blacklisted" },
];

export interface CrmViewProps {
  workspaceId: string;
  className?: string;
}

export function CrmView({ workspaceId, className }: CrmViewProps) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<CustomerStatus | "all">("all");
  const debouncedSearch = React.useDeferredValue(search);

  const customersQuery = useCustomers(workspaceId, {
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
            Customers
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your customer relationships — leads, active accounts, and archived customers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="size-4" /> New customer
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
            placeholder="Search by name, email, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search customers"
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as CustomerStatus | "all")}
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

      {customersQuery.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : customersQuery.isError ? (
        <EmptyState
          icon={User}
          title="Couldn't load customers"
          description="Please try again later."
        />
      ) : (customersQuery.data ?? []).length === 0 ? (
        <EmptyState
          icon={User}
          title="No customers yet"
          description="Add your first customer to start tracking interactions, invoices, and opportunities."
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="size-4" /> Add customer
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(customersQuery.data ?? []).map((c) => (
            <CustomerCard key={c.id} customer={c} />
          ))}
        </div>
      )}

      <CreateCustomerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="pb-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
              <User className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-sm">{customer.name}</CardTitle>
              <CardDescription className="truncate text-xs">
                {customer.company || "—"}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("capitalize", STATUS_BADGE[customer.status as CustomerStatus] ?? "")}
          >
            {customer.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        {customer.email ? (
          <div className="flex items-center gap-2">
            <Mail className="size-3.5" aria-hidden="true" />
            <a
              href={`mailto:${customer.email}`}
              className="truncate hover:underline"
            >
              {customer.email}
            </a>
          </div>
        ) : null}
        {customer.phone ? (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5" aria-hidden="true" />
            <span className="truncate">{customer.phone}</span>
          </div>
        ) : null}
        {customer.company ? (
          <div className="flex items-center gap-2">
            <Building2 className="size-3.5" aria-hidden="true" />
            <span className="truncate">{customer.company}</span>
          </div>
        ) : null}
        {customer.tags && customer.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {customer.tags.slice(0, 4).map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="pt-1 text-[10px] text-muted-foreground/70">
          Added {formatDate(customer.created_at)}
        </p>
      </CardContent>
    </Card>
  );
}

function CreateCustomerDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [status, setStatus] = React.useState<CustomerStatus>("lead");
  const mutation = useCreateCustomer();
  const { toast } = useToast();

  const reset = React.useCallback(() => {
    setName("");
    setEmail("");
    setPhone("");
    setCompany("");
    setStatus("lead");
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      await mutation.mutateAsync({
        workspaceId,
        input: {
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          status,
        },
      });
      toast({ title: "Customer created" });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Failed to create customer",
        description:
          err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [
    company,
    email,
    mutation,
    name,
    onOpenChange,
    phone,
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
            <Briefcase className="size-4" /> New customer
          </DialogTitle>
          <DialogDescription>
            Create a new CRM record. You can fill in more details later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cust-name">Name *</Label>
            <Input
              id="cust-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input
                id="cust-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input
                id="cust-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-company">Company</Label>
            <Input
              id="cust-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Acme Inc."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cust-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as CustomerStatus)}
            >
              <SelectTrigger id="cust-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
                <SelectItem value="blacklisted">Blacklisted</SelectItem>
              </SelectContent>
            </Select>
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
            {mutation.isPending ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
