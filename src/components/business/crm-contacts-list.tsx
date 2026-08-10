"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Briefcase,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CrmContactFormDialog } from "@/components/business/crm-contact-form";
import {
  getContacts,
  deleteContact,
} from "@/services/crm/actions";
import type { Contact } from "@/services/crm/types";
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

interface CrmContactsListProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────

export function CrmContactsList({ workspaceId }: CrmContactsListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchContacts = useCallback(() => {
    setLoading(true);

    getContacts({
      workspaceId,
      page,
      pageSize: PAGE_SIZE,
      search: search.trim() || undefined,
    })
      .then((res) => {
        if (res.success && res.data) {
          setContacts(res.data);
          setTotal(res.total ?? 0);
        } else {
          setContacts([]);
          setTotal(0);
        }
      })
      .catch(() => {
        setContacts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [workspaceId, page, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContacts();
  }, [fetchContacts]);

  // Reset page on search change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [search]);

  function handleCreate() {
    setEditingContact(undefined);
    setDialogOpen(true);
  }

  function handleEdit(contact: Contact) {
    setEditingContact(contact);
    setDialogOpen(true);
  }

  async function handleDelete(contactId: string) {
    setDeletingId(contactId);
    const res = await deleteContact(contactId);
    if (res.success) {
      toast.success("Contact deleted");
      fetchContacts();
    } else {
      toast.error(res.message || "Failed to delete contact");
    }
    setDeletingId(null);
  }

  function handleDialogSuccess() {
    setDialogOpen(false);
    setEditingContact(undefined);
    fetchContacts();
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
            placeholder="Search contacts..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
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
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground text-center">
                      No contacts found.
                    </TableCell>
                  </TableRow>
                )}
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    {/* Name */}
                    <TableCell>
                      <span className="font-medium">
                        {contact.first_name}
                        {contact.last_name ? ` ${contact.last_name}` : ""}
                      </span>
                    </TableCell>

                    {/* Job Title */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {contact.job_title ? (
                          <>
                            <Briefcase className="text-muted-foreground h-3 w-3" />
                            <span className="text-sm truncate max-w-[160px]">
                              {contact.job_title}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Email */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {contact.email ? (
                          <>
                            <Mail className="text-muted-foreground h-3 w-3" />
                            <span className="text-sm truncate max-w-[160px]">
                              {contact.email}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Phone */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {contact.phone ? (
                          <>
                            <Phone className="text-muted-foreground h-3 w-3" />
                            <span className="text-sm">{contact.phone}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Primary */}
                    <TableCell>
                      {contact.is_primary ? (
                        <Badge variant="default" className="text-xs">Primary</Badge>
                      ) : null}
                    </TableCell>

                    {/* Created */}
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(contact.created_at)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(contact)}
                        >
                          <span className="sr-only">Edit</span>
                          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                            <path d="M11.5 1.5a2.12 2.12 0 0 1 3 3L5 14l-4 1 1-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(contact.id)}
                          disabled={deletingId === contact.id}
                        >
                          {deletingId === contact.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* Add/Edit Contact Dialog */}
      <CrmContactFormDialog
        workspaceId={workspaceId}
        contact={editingContact}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}
