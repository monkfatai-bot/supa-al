"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Building2,
  Mail,
  Phone,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  getCompanies,
  getCompany,
  createCompany,
} from "@/services/crm/actions";
import type { CompanyWithContacts, Contact } from "@/services/crm/types";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Helpers ────────────────────────────────────────────────────────

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Props ──────────────────────────────────────────────────────────

interface CrmCompaniesListProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────

export function CrmCompaniesList({ workspaceId }: CrmCompaniesListProps) {
  const [companies, setCompanies] = useState<CompanyWithContacts[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Expanded rows (companyId -> contacts)
  const [expandedRows, setExpandedRows] = useState<Record<string, Contact[]>>({});
  const [loadingContacts, setLoadingContacts] = useState<Record<string, boolean>>({});

  // Add Company dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formIndustry, setFormIndustry] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchCompanies = useCallback(() => {
    setLoading(true);

    getCompanies({
      workspaceId,
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() || undefined,
    })
      .then((res) => {
        if (res.success && res.data) {
          setCompanies(res.data);
          setTotal(res.total ?? 0);
        } else {
          setCompanies([]);
          setTotal(0);
        }
      })
      .catch(() => {
        setCompanies([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [workspaceId, page, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCompanies();
  }, [fetchCompanies]);

  // Reset page on search change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search]);

  async function toggleExpand(companyId: string) {
    if (expandedRows[companyId]) {
      // Collapse
      const next = { ...expandedRows };
      delete next[companyId];
      setExpandedRows(next);
      return;
    }

    // Fetch contacts and expand
    setLoadingContacts((prev) => ({ ...prev, [companyId]: true }));
    const res = await getCompany(companyId);
    if (res.success && res.record?.contacts) {
      setExpandedRows((prev) => ({
        ...prev,
        [companyId]: res.record!.contacts!,
      }));
    } else {
      toast.error("Failed to load contacts");
    }
    setLoadingContacts((prev) => ({ ...prev, [companyId]: false }));
  }

  async function handleCreateCompany() {
    if (!formName.trim()) {
      toast.error("Company name is required.");
      return;
    }

    setSubmitting(true);
    const res = await createCompany(workspaceId, {
      name: formName.trim(),
      industry: formIndustry.trim(),
      email: formEmail.trim(),
      phone: formPhone.trim(),
      website: formWebsite.trim(),
      notes: formNotes.trim(),
    });

    if (res.success) {
      toast.success("Company created");
      setDialogOpen(false);
      setFormName("");
      setFormIndustry("");
      setFormEmail("");
      setFormPhone("");
      setFormWebsite("");
      setFormNotes("");
      fetchCompanies();
    } else {
      toast.error(res.message || "Failed to create company");
    }
    setSubmitting(false);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies..."
            className="pl-9"
          />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Company</DialogTitle>
              <DialogDescription>
                Create a new company in your CRM.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="company-name">Name *</Label>
                <Input
                  id="company-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-industry">Industry</Label>
                <Input
                  id="company-industry"
                  value={formIndustry}
                  onChange={(e) => setFormIndustry(e.target.value)}
                  placeholder="Technology"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="company-email">Email</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="info@acme.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="company-phone">Phone</Label>
                  <Input
                    id="company-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-website">Website</Label>
                <Input
                  id="company-website"
                  value={formWebsite}
                  onChange={(e) => setFormWebsite(e.target.value)}
                  placeholder="https://acme.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-notes">Notes</Label>
                <Input
                  id="company-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Any additional notes..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCompany} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Company
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-center">Contacts</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground text-center">
                      No companies found.
                    </TableCell>
                  </TableRow>
                )}
                {companies.map((company) => {
                  const isExpanded = !!expandedRows[company.id];
                  const contacts = expandedRows[company.id] ?? [];
                  const isLoadingContacts = loadingContacts[company.id];

                  return (
                    <>
                      {/* Company Row */}
                      <TableRow
                        key={company.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleExpand(company.id)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="text-muted-foreground h-4 w-4" />
                            <span className="font-medium">{company.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {company.industry ? (
                            <Badge variant="outline" className="text-xs">
                              {company.industry}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="text-muted-foreground h-3 w-3" />
                            <span className="truncate max-w-[160px]">
                              {company.email || "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Phone className="text-muted-foreground h-3 w-3" />
                            <span>{company.phone || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Users className="text-muted-foreground h-3 w-3" />
                            <span className="text-sm font-medium">
                              {contacts.length > 0
                                ? contacts.length
                                : company.contacts?.length ?? 0}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDate(company.created_at)}
                        </TableCell>
                      </TableRow>

                      {/* Expanded Contacts */}
                      {isExpanded && (
                        <TableRow key={`${company.id}-contacts`}>
                          <TableCell colSpan={7} className="bg-muted/30 p-0">
                            <div className="px-8 py-3">
                              {isLoadingContacts ? (
                                <div className="flex items-center gap-2">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span className="text-sm">Loading contacts...</span>
                                </div>
                              ) : contacts.length > 0 ? (
                                <div className="rounded-lg border bg-background">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Job Title</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Primary</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {contacts.map((contact) => (
                                        <TableRow key={contact.id}>
                                          <TableCell className="text-sm font-medium">
                                            {contact.first_name} {contact.last_name}
                                          </TableCell>
                                          <TableCell className="text-muted-foreground text-sm">
                                            {contact.job_title || "—"}
                                          </TableCell>
                                          <TableCell className="text-sm">
                                            {contact.email || "—"}
                                          </TableCell>
                                          <TableCell className="text-sm">
                                            {contact.phone || "—"}
                                          </TableCell>
                                          <TableCell>
                                            {contact.is_primary ? (
                                              <Badge variant="default" className="text-xs">Primary</Badge>
                                            ) : null}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-sm py-2">
                                  No contacts for this company.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Page {page} of {totalPages} &middot; {total} total
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
