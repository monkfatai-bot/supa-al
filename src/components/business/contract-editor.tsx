"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Trash2,
  CheckCircle2,
  Sparkles,
  FileText,
  Plus,
  X,
  History,
  AlertCircle,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  createContract,
  updateContract,
  deleteContract,
  getContract,
  approveContract,
  createContractVersion,
} from "@/services/contract";
import { getCustomers } from "@/services/crm";
import { writeContractWithAi } from "@/services/business-assistant";
import type { ContractWithRelations } from "@/services/contract";
import type { ContractType, ContractStatus } from "@/types/generated/database";
import type { Customer } from "@/services/crm";
import type { BusinessAssistantResponse } from "@/services/business-assistant";
import type { Json } from "@/types/generated/database";

// ── Constants ──────────────────────────────────────────────────────────────────

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: "nda", label: "NDA" },
  { value: "employment", label: "Employment" },
  { value: "freelance", label: "Freelance" },
  { value: "service", label: "Service" },
  { value: "partnership", label: "Partnership" },
  { value: "consulting", label: "Consulting" },
  { value: "purchase", label: "Purchase" },
];

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  pending_review: "default",
  active: "secondary",
  expired: "destructive",
  terminated: "destructive",
  cancelled: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
  cancelled: "Cancelled",
};

const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["pending_review", "cancelled"],
  pending_review: ["active", "draft", "cancelled"],
  active: ["expired", "terminated"],
  expired: ["active", "cancelled"],
  terminated: [],
  cancelled: ["draft"],
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ContractEditorProps {
  workspaceId: string;
  contractId?: string;
  customerId?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ContractEditor({
  workspaceId,
  contractId,
  customerId: initialCustomerId,
}: ContractEditorProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [contract, setContract] = useState<ContractWithRelations | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [title, setTitle] = useState("");
  const [contractType, setContractType] = useState<ContractType>("service");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [value, setValue] = useState("");
  const [terms, setTerms] = useState("");
  const [content, setContent] = useState("");
  const [variables, setVariables] = useState<{ key: string; value: string }[]>(
    []
  );

  const [loading, setLoading] = useState(!!contractId);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraftDialogOpen, setAiDraftDialogOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  const [showVersions, setShowVersions] = useState(false);

  // ── Fetch customers ─────────────────────────────────────────────────────
  const fetchCustomers = useCallback(() => {
    getCustomers({ workspaceId, pageSize: 200 }).then((res) => {
      if (res.success && res.data) setCustomers(res.data);
    });
  }, [workspaceId]);

  // ── Fetch existing contract ──────────────────────────────────────────────
  const fetchContract = useCallback(() => {
    if (!contractId) return;
    setLoading(true);
    getContract(contractId).then((data) => {
      if (data) {
        setContract(data);
        setTitle(data.title);
        setContractType(data.contract_type);
        setSelectedCustomerId(data.customer_id ?? "");
        setStartDate(data.start_date?.split("T")[0] ?? "");
        setEndDate(data.end_date?.split("T")[0] ?? "");
        setValue(data.value ? String(data.value) : "");
        setTerms(data.terms);
        setContent(data.content);

        // Parse variables from JSON
        if (data.variables && typeof data.variables === "object") {
          const vars = data.variables as Record<string, string>;
          setVariables(
            Object.entries(vars).map(([key, val]) => ({
              key,
              value: String(val),
            }))
          );
        }
      }
      setLoading(false);
    });
  }, [contractId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  useEffect(() => {
    if (initialCustomerId) setSelectedCustomerId(initialCustomerId);
  }, [initialCustomerId]);

  // ── Variable helpers ─────────────────────────────────────────────────────
  function addVariable() {
    setVariables((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeVariable(index: number) {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }

  function updateVariable(
    index: number,
    field: "key" | "value",
    val: string
  ) {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: val } : v))
    );
  }

  function variablesToJson(): Json {
    const obj: Record<string, string> = {};
    variables
      .filter((v) => v.key.trim())
      .forEach((v) => {
        obj[v.key.trim()] = v.value;
      });
    return obj as unknown as Json;
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    setError("");

    const varsJson = variablesToJson();

    if (contractId && contract) {
      const res = await updateContract(contractId, {
        title: title.trim(),
        contractType,
        customerId: selectedCustomerId || null,
        startDate: startDate || null,
        endDate: endDate || null,
        value: parseFloat(value) || 0,
        terms,
        content,
        variables: varsJson,
      });

      if (!res.success) {
        setError(res.message);
      } else {
        setContract((prev) =>
          prev && res.contract ? { ...prev, ...res.contract } : prev
        );
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
      }
    } else {
      const res = await createContract({
        workspaceId,
        title: title.trim(),
        contractType,
        customerId: selectedCustomerId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        value: parseFloat(value) || undefined,
        terms,
        content,
        variables: varsJson,
      });

      if (!res.success) {
        setError(res.message);
      } else if (res.contract) {
        setContract(res.contract as ContractWithRelations);
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
      }
    }

    setSaving(false);
  }

  // ── Save as new version ──────────────────────────────────────────────────
  async function handleSaveVersion() {
    if (!contractId) {
      await handleSave();
      return;
    }

    if (!content.trim()) {
      setError("Cannot save an empty version.");
      return;
    }

    setSaving(true);
    setError("");

    const res = await createContractVersion(contractId, {
      content,
      changeSummary: "Updated contract content",
    });

    if (!res.success) {
      setError(res.message);
    } else {
      setContract((prev) =>
        prev && res.contract ? { ...prev, ...res.contract } : prev
      );
      setSaveStatus("Version saved");
      setTimeout(() => setSaveStatus(""), 2000);
      fetchContract();
    }

    setSaving(false);
  }

  // ── Approve ──────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!contractId) return;
    setApproving(true);
    setError("");

    const res = await approveContract(contractId);

    if (!res.success) {
      setError(res.message);
    } else if (res.contract) {
      setContract((prev) =>
        prev ? { ...prev, ...res.contract } : prev
      );
    }

    setApproving(false);
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!contractId) return;
    if (!confirm("Are you sure you want to delete this contract?")) return;
    setDeleting(true);
    const res = await deleteContract(contractId);
    if (!res.success) {
      setError(res.message);
    }
    setDeleting(false);
  }

  // ── Status transition ────────────────────────────────────────────────────
  async function handleStatusTransition(newStatus: ContractStatus) {
    if (!contractId || !contract) return;
    setSaving(true);
    setError("");

    const { updateContractStatus } = await import("@/services/contract");
    const res = await updateContractStatus(contractId, newStatus);

    if (!res.success) {
      setError(res.message);
    } else {
      setContract((prev) =>
        prev && res.contract ? { ...prev, ...res.contract } : prev
      );
    }

    setSaving(false);
  }

  // ── AI Draft ─────────────────────────────────────────────────────────────
  async function handleAiDraft() {
    if (!aiDescription.trim()) {
      setError("Please describe the contract.");
      return;
    }

    setAiLoading(true);
    setError("");

    const res: BusinessAssistantResponse = await writeContractWithAi(
      workspaceId,
      {
        contractType,
        description: aiDescription,
      }
    );

    if (res.success && res.metadata?.generatedContract) {
      const generated = res.metadata.generatedContract as Record<
        string,
        unknown
      >;

      if (typeof generated.title === "string") {
        setTitle(generated.title);
      }

      // Convert sections array to markdown content
      const sections = generated.sections as
        | Array<{ heading: string; content: string }>
        | undefined;
      if (Array.isArray(sections)) {
        const md = sections
          .map((s) => `## ${s.heading}\n\n${s.content}`)
          .join("\n\n");
        setContent(md);
      } else if (typeof generated.content === "string") {
        setContent(generated.content);
      }

      if (typeof generated.summary === "string") {
        setTerms(generated.summary);
      }

      setAiDraftDialogOpen(false);
      setAiDescription("");
    } else {
      setError(res.error ?? "AI draft failed.");
    }

    setAiLoading(false);
  }

  // ── Get valid next statuses ──────────────────────────────────────────────
  const currentStatus = contract?.status ?? ("draft" as ContractStatus);
  const nextStatuses = VALID_TRANSITIONS[currentStatus] ?? [];

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6">
      {/* Main Editor */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-muted-foreground" />
            <h2 className="text-xl font-semibold">
              {contract ? contract.title : "New Contract"}
            </h2>
            <Badge variant={STATUS_VARIANT[currentStatus] ?? "outline"}>
              {STATUS_LABELS[currentStatus] ?? currentStatus}
            </Badge>
            {contract && (
              <Badge variant="secondary" className="text-xs">
                v{contract.version_number}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {saving ? "Saving..." : saveStatus ? `✓ ${saveStatus}` : ""}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowVersions(!showVersions)}
            >
              <History className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Details Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Contract Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contract title"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Contract Type
                </label>
                <Select
                  value={contractType}
                  onValueChange={(v) => setContractType(v as ContractType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map((ct) => (
                      <SelectItem key={ct.value} value={ct.value}>
                        {ct.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Customer</label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={setSelectedCustomerId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select customer (optional)" />
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
                  Contract Value
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  End Date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Terms / Summary
              </label>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Brief terms or summary..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Content Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Contract Content</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter contract text here (markdown supported)..."
              rows={18}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>

        {/* Variables Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Variables
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={addVariable}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Variable
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {variables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No variables defined. Add key-value pairs for dynamic contract
                fields.
              </p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={v.key}
                      onChange={(e) =>
                        updateVariable(i, "key", e.target.value)
                      }
                      placeholder="Variable name"
                      className="h-9 flex-1"
                    />
                    <Input
                      value={v.value}
                      onChange={(e) =>
                        updateVariable(i, "value", e.target.value)
                      }
                      placeholder="Value"
                      className="h-9 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeVariable(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Workflow Display */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Status Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  STATUS_VARIANT[currentStatus] ?? "outline"
                }
                className="px-3 py-1"
              >
                {STATUS_LABELS[currentStatus] ?? currentStatus}
              </Badge>
              {nextStatuses.length > 0 && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  {nextStatuses.map((ns) => (
                    <Button
                      key={ns}
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleStatusTransition(ns as ContractStatus)
                      }
                      disabled={saving}
                    >
                      {STATUS_LABELS[ns] ?? ns}
                    </Button>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bottom Action Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {contractId && (
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
          </div>

          <div className="flex flex-wrap gap-2">
            {/* AI Draft Dialog */}
            <Dialog
              open={aiDraftDialogOpen}
              onOpenChange={setAiDraftDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={aiLoading}
                >
                  {aiLoading ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  AI Draft
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>AI Contract Draft</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Contract Type
                    </label>
                    <Select
                      value={contractType}
                      onValueChange={(v) =>
                        setContractType(v as ContractType)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map((ct) => (
                          <SelectItem key={ct.value} value={ct.value}>
                            {ct.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Describe the contract purpose and key details.
                  </p>
                  <Textarea
                    value={aiDescription}
                    onChange={(e) => setAiDescription(e.target.value)}
                    placeholder={"e.g.\nWeb development services for building an e-commerce platform\nDuration: 6 months, Budget: $50,000"}
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAiDraftDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAiDraft}
                      disabled={aiLoading || !aiDescription.trim()}
                    >
                      {aiLoading ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-4 w-4" />
                      )}
                      Generate Draft
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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
              {contractId ? "Update" : "Create"}
            </Button>

            {contractId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveVersion}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <History className="mr-1.5 h-4 w-4" />
                )}
                Save Version
              </Button>
            )}

            {currentStatus === "pending_review" && (
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approving}
              >
                {approving ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                )}
                Approve Contract
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Version History Sidebar */}
      {showVersions && (
        <div className="hidden w-80 shrink-0 border-l lg:block">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Version History</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowVersions(false)}
            >
              Close
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-2 p-3">
              {contract?.versions && contract.versions.length > 0 ? (
                contract.versions.map((ver) => (
                  <div key={ver.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        v{ver.version_number}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {new Date(ver.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {ver.change_summary && (
                      <p className="text-muted-foreground mt-1.5 text-xs">
                        {ver.change_summary}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground p-4 text-center text-xs">
                  No versions yet.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
