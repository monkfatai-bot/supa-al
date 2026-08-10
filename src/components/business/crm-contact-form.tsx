"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createContact,
  updateContact,
  getCompanies,
} from "@/services/crm/actions";
import type { Contact, Company } from "@/types/generated/database";
import { toast } from "sonner";

// ── Props ──────────────────────────────────────────────────────────

interface CrmContactFormProps {
  workspaceId: string;
  companyId?: string;
  contact?: Contact;
  onSuccess?: () => void;
}

// ── Component ──────────────────────────────────────────────────────

export function CrmContactForm({
  workspaceId,
  companyId: initialCompanyId,
  contact,
  onSuccess,
}: CrmContactFormProps) {
  const isEditing = !!contact;

  // Form state
  const [firstName, setFirstName] = useState(contact?.first_name ?? "");
  const [lastName, setLastName] = useState(contact?.last_name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [jobTitle, setJobTitle] = useState(contact?.job_title ?? "");
  const [address, setAddress] = useState(contact?.address ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    initialCompanyId ?? contact?.company_id ?? "none",
  );
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false);

  // Companies for dropdown
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(!isEditing);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch companies for the dropdown
  const fetchCompanies = useCallback(() => {
    if (isEditing && selectedCompanyId !== "none") return;
    setLoadingCompanies(true);
    getCompanies({
      workspaceId,
      page: 1,
      pageSize: 100,
    })
      .then((res) => {
        if (res.success && res.data) {
          setCompanies(res.data);
        }
      })
      .finally(() => setLoadingCompanies(false));
  }, [workspaceId, isEditing, selectedCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCompanies();
  }, [fetchCompanies]);

  // Reset form when contact changes (edit mode)
  useEffect(() => {
    if (contact) {
      void Promise.resolve().then(() => {
        setFirstName(contact.first_name);
        setLastName(contact.last_name);
        setEmail(contact.email);
        setPhone(contact.phone);
        setJobTitle(contact.job_title);
        setAddress(contact.address);
        setNotes(contact.notes);
        setSelectedCompanyId(contact.company_id ?? "none");
        setIsPrimary(contact.is_primary);
      });
    }
  }, [contact]);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!firstName.trim()) {
      newErrors.first_name = "First name is required.";
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = "Invalid email address.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSubmitting(true);

    try {
      if (isEditing && contact) {
        // Update existing contact
        const res = await updateContact(contact.id, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          job_title: jobTitle.trim(),
          address: address.trim(),
          notes: notes.trim(),
          company_id: selectedCompanyId === "none" ? null : selectedCompanyId,
          is_primary: isPrimary,
        });

        if (res.success) {
          toast.success("Contact updated");
          onSuccess?.();
        } else {
          toast.error(res.message || "Failed to update contact");
        }
      } else {
        // Create new contact
        const res = await createContact(workspaceId, {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          job_title: jobTitle.trim(),
          address: address.trim(),
          notes: notes.trim(),
          company_id: selectedCompanyId === "none" ? null : selectedCompanyId,
          is_primary: isPrimary,
        });

        if (res.success) {
          toast.success("Contact created");
          // Clear form
          setFirstName("");
          setLastName("");
          setEmail("");
          setPhone("");
          setJobTitle("");
          setAddress("");
          setNotes("");
          setSelectedCompanyId(initialCompanyId ?? "none");
          setIsPrimary(false);
          onSuccess?.();
        } else {
          toast.error(res.message || "Failed to create contact");
        }
      }
    } catch {
      toast.error("An unexpected error occurred.");
    }

    setSubmitting(false);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">
          {isEditing ? "Edit Contact" : "New Contact"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {isEditing
            ? "Update the contact information below."
            : "Add a new contact to your workspace."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* First Name (required) */}
        <div className="grid gap-2">
          <Label htmlFor="contact-first-name">
            First Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="contact-first-name"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              if (errors.first_name) setErrors((prev) => ({ ...prev, first_name: "" }));
            }}
            placeholder="John"
          />
          {errors.first_name && (
            <p className="text-destructive text-xs">{errors.first_name}</p>
          )}
        </div>

        {/* Last Name */}
        <div className="grid gap-2">
          <Label htmlFor="contact-last-name">Last Name</Label>
          <Input
            id="contact-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Doe"
          />
        </div>

        {/* Email */}
        <div className="grid gap-2">
          <Label htmlFor="contact-email">Email</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: "" }));
            }}
            placeholder="john@example.com"
          />
          {errors.email && (
            <p className="text-destructive text-xs">{errors.email}</p>
          )}
        </div>

        {/* Phone */}
        <div className="grid gap-2">
          <Label htmlFor="contact-phone">Phone</Label>
          <Input
            id="contact-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
          />
        </div>

        {/* Job Title */}
        <div className="grid gap-2">
          <Label htmlFor="contact-job-title">Job Title</Label>
          <Input
            id="contact-job-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Software Engineer"
          />
        </div>

        {/* Company Select */}
        <div className="grid gap-2">
          <Label>Company</Label>
          {loadingCompanies ? (
            <div className="flex h-10 items-center rounded-md border px-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No company</SelectItem>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Address - full width */}
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="contact-address">Address</Label>
          <Input
            id="contact-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State, ZIP"
          />
        </div>

        {/* Notes - full width */}
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="contact-notes">Notes</Label>
          <Input
            id="contact-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes about this contact..."
          />
        </div>

        {/* Is Primary toggle */}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            id="contact-is-primary"
            checked={isPrimary}
            onCheckedChange={setIsPrimary}
          />
          <Label htmlFor="contact-is-primary" className="cursor-pointer">
            Primary contact for this company
          </Label>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Contact" : "Create Contact"}
        </Button>
        {isEditing && (
          <Button
            variant="outline"
            onClick={() => onSuccess?.()}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Dialog Wrapper ────────────────────────────────────────────────

interface CrmContactFormDialogProps {
  workspaceId: string;
  companyId?: string;
  contact?: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CrmContactFormDialog({
  workspaceId,
  companyId,
  contact,
  open,
  onOpenChange,
  onSuccess,
}: CrmContactFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "New Contact"}</DialogTitle>
          <DialogDescription>
            {contact
              ? "Update the contact information below."
              : "Add a new contact to your workspace."}
          </DialogDescription>
        </DialogHeader>
        <CrmContactForm
          workspaceId={workspaceId}
          companyId={companyId}
          contact={contact}
          onSuccess={() => {
            onOpenChange(false);
            onSuccess?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
