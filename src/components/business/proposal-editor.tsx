"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Trash2,
  Save,
  Send,
  AlertCircle,
  Loader2,
  Sparkles,
  FileText,
  X,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Eye,
  Search,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createProposal,
  updateProposal,
  deleteProposal,
  getProposals,
  getProposal,
  updateProposalStatus,
  aiGenerateProposal,
  convertProposalToContract,
} from "@/services/proposal/actions";
import { getCustomers } from "@/services/crm";
import type { ProposalWithCustomer, ProposalActionResponse } from "@/services/proposal/types";
import type { Customer } from "@/services/crm";
import type { ProposalStatus, ProposalType } from "@/types/generated/database";

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  sent: "default",
  viewed: "secondary",
  accepted: "secondary",
  rejected: "destructive",
  expired: "destructive",
};

const PROPOSAL_TYPES: { value: ProposalType; label: string }[] = [
  { value: "sales", label: "Sales" },
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "project", label: "Project" },
];

const STATUS_FILTERS = ["all", "draft", "sent", "viewed", "accepted", "rejected", "expired"];

// ── Props ─────────────────────────────────────────────────────────────────────

interface ProposalEditorProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ProposalEditor({ workspaceId }: ProposalEditorProps) {
  // ── List state ───────────────────────────────────────────────────────────
  const [proposals, setProposals] = useState<ProposalWithCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const pageSize = 15;

  // ── Detail/edit state ───────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposalWithCustomer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [title, setTitle] = useState("");
  const [proposalType, setProposalType] = useState<ProposalType>("sales");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [value, setValue] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [tags, setTags] = useState("");

  // ── Action states ───────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  // ── AI state ────────────────────────────────────────────────────────────
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiType, setAiType] = useState<ProposalType>("sales");

  // ── Create dialog state ─────────────────────────────────────────────────
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<ProposalType>("sales");
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  // ── Fetch proposals list ────────────────────────────────────────────────
  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProposals(workspaceId, {
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter !== "all" ? (statusFilter as ProposalStatus) : undefined,
        type: typeFilter !== "all" ? (typeFilter as ProposalType) : undefined,
      });
      setProposals(res.proposals);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proposals");
    }
    setLoading(false);
  }, [workspaceId, page, search, statusFilter, typeFilter]);

  // ── Fetch customers ─────────────────────────────────────────────────────
  const fetchCustomers = useCallback(() => {
    getCustomers({ workspaceId, pageSize: 200 }).then((res) => {
      if (res.success && res.data) setCustomers(res.data);
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Fetch single proposal ───────────────────────────────────────────────
  const fetchProposal = useCallback(async (id: string) => {
    const data = await getProposal(id);
    if (data) {
      setProposal(data);
      setTitle(data.title);
      setProposalType(data.proposal_type);
      setContent(data.content);
      setSummary(data.summary);
      setValue(String(data.value ?? 0));
      setValidUntil(data.valid_until?.split("T")[0] ?? "");
      setSelectedCustomerId(data.customer_id ?? "");
      setTags(data.tags?.join(", ") ?? "");
    }
  }, []);

  const resetForm = useCallback(() => {
    setTitle("");
    setProposalType("sales");
    setContent("");
    setSummary("");
    setValue("");
    setValidUntil("");
    setSelectedCustomerId("");
    setTags("");
    setError("");
    setSaveStatus("");
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (selectedId) {
      void fetchProposal(selectedId);
    } else {
      setProposal(null);
      resetForm();
    }
  }, [selectedId, fetchProposal, resetForm]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");

    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (selectedId && proposal) {
      const res = await updateProposal(selectedId, {
        title: title.trim(),
        proposalType,
        content,
        summary,
        value: parseFloat(value) || 0,
        validUntil: validUntil || null,
        customerId: selectedCustomerId || null,
        tags: parsedTags,
      });
      if (!res.success) {
        setError(res.message);
      } else {
        setSaveStatus("Saved");
        setTimeout(() => setSaveStatus(""), 2000);
        fetchProposals();
      }
    }
    setSaving(false);
  }

  // ── Create ───────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newTitle.trim()) {
      setError("Title is required.");
      return;
    }
    setCreating(true);
    setError("");

    const res = await createProposal({
      workspaceId,
      title: newTitle.trim(),
      proposalType: newType,
      content: "",
      summary: "",
      value: 0,
      validUntil: null,
      tags: [],
    });

    if (res.success && res.proposal) {
      setCreateDialogOpen(false);
      setNewTitle("");
      setNewType("sales");
      setSelectedId(res.proposal.id);
    } else {
      setError(res.message);
    }
    setCreating(false);
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function handleSend() {
    if (!selectedId) {
      await handleSave();
      return;
    }
    setSending(true);
    setError("");
    const res = await updateProposalStatus(selectedId, "sent");
    if (!res.success) {
      setError(res.message);
    } else {
      setProposal((prev) => (prev ? { ...prev, status: "sent" as const } : prev));
      fetchProposals();
    }
    setSending(false);
  }

  // ── Delete ───────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!selectedId) return;
    if (!confirm("Are you sure you want to delete this proposal?")) return;
    setDeleting(true);
    const res = await deleteProposal(selectedId);
    if (!res.success) {
      setError(res.message);
    }
    setDeleting(false);
    setSelectedId(null);
    resetForm();
    fetchProposals();
  }

  // ── Status actions ───────────────────────────────────────────────────────
  async function handleStatusChange(id: string, status: ProposalStatus) {
    setActionLoading((prev) => new Set(prev).add(id));
    const res = await updateProposalStatus(id, status);
    if (!res.success) {
      setError(res.message);
    } else {
      fetchProposals();
      if (selectedId === id && res.proposal) {
        setProposal(res.proposal as ProposalWithCustomer);
      }
    }
    setActionLoading((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ── Convert to Contract ───────────────────────────────────────────────────
  async function handleConvert() {
    if (!selectedId) return;
    if (!confirm("Convert this proposal to a contract?")) return;
    setConverting(true);
    setError("");
    const res = await convertProposalToContract(selectedId);
    if (!res.success) {
      setError(res.message);
    }
    setConverting(false);
  }

  // ── AI Generate ──────────────────────────────────────────────────────────
  async function handleAiGenerate() {
    if (!aiPrompt.trim()) {
      setError("Please enter a description for AI generation.");
      return;
    }
    setAiLoading(true);
    setError("");

    const res: ProposalActionResponse = await aiGenerateProposal({
      workspaceId,
      type: aiType,
      prompt: aiPrompt,
      tone: aiTone,
      customerId: selectedCustomerId || undefined,
    });

    if (res.success && res.proposal) {
      setAiDialogOpen(false);
      setAiPrompt("");
      setSelectedId(res.proposal.id);
    } else {
      setError(res.message);
    }
    setAiLoading(false);
  }

  // ── Render: Detail / Edit View ────────────────────────────────────────────
  if (proposal) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setSelectedId(null); resetForm(); }}>
              <X className="h-4 w-4" />
            </Button>
            <FileText className="h-6 w-6 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{proposal.title}</h2>
            <Badge variant={STATUS_VARIANT[proposal.status] ?? "outline"}>
              {proposal.status.replace(/_/g, " ")}
            </Badge>
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
            <CardTitle className="text-base">Proposal Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="mb-1.5 block text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Proposal title"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Type</label>
                <Select value={proposalType} onValueChange={(v) => setProposalType(v as ProposalType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Customer</label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Value ($)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Valid Until</label>
                <Input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Tags (comma-separated)</label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="e.g. ai-generated, q1"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Summary</label>
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Brief executive summary..."
                rows={2}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Content (Markdown)</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Full proposal content in markdown..."
                rows={16}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bottom Action Bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Created {new Date(proposal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {proposal.updated_at !== proposal.created_at && ` · Updated ${new Date(proposal.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save
            </Button>
            {proposal.status === "draft" && (
              <Button variant="outline" size="sm" onClick={handleSend} disabled={sending}>
                {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                Send Proposal
              </Button>
            )}
            {proposal.status === "sent" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange(proposal.id, "viewed")}
                disabled={actionLoading.has(proposal.id)}
              >
                {actionLoading.has(proposal.id) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Eye className="mr-1.5 h-4 w-4" />}
                Mark Viewed
              </Button>
            )}
            {(proposal.status === "sent" || proposal.status === "viewed") && (
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 hover:text-green-700"
                onClick={() => handleStatusChange(proposal.id, "accepted")}
                disabled={actionLoading.has(proposal.id)}
              >
                {actionLoading.has(proposal.id) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Accept
              </Button>
            )}
            {(proposal.status === "sent" || proposal.status === "viewed") && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => handleStatusChange(proposal.id, "rejected")}
                disabled={actionLoading.has(proposal.id)}
              >
                {actionLoading.has(proposal.id) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <XCircle className="mr-1.5 h-4 w-4" />}
                Reject
              </Button>
            )}
            {proposal.status === "accepted" && !proposal.converted_contract_id && (
              <Button variant="secondary" size="sm" onClick={handleConvert} disabled={converting}>
                {converting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-1.5 h-4 w-4" />}
                Convert to Contract
              </Button>
            )}
            {proposal.converted_contract_id && (
              <Badge variant="secondary" className="text-xs">Converted to Contract</Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: List View ────────────────────────────────────────────────────
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Proposals</h2>
          <p className="text-muted-foreground text-sm">Manage and track business proposals.</p>
        </div>
        <div className="flex gap-2">
          {/* AI Generate Dialog */}
          <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={aiLoading}>
                {aiLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                AI Generate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI-Generated Proposal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Describe what the proposal should cover. The AI will generate a full professional proposal.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Type</label>
                    <Select value={aiType} onValueChange={(v) => setAiType(v as ProposalType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROPOSAL_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Tone</label>
                    <Select value={aiTone} onValueChange={setAiTone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="persuasive">Persuasive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={"e.g.\nWebsite redesign with 10 pages for Acme Corp\nInclude SEO optimization and content strategy\nTimeline: 3 months, Budget: $15,000"}
                  rows={6}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAiDialogOpen(false)}>
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleAiGenerate} disabled={aiLoading || !aiPrompt.trim()}>
                    {aiLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    Generate
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Create Dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" /> New Proposal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Proposal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Title *</label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Proposal title"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as ProposalType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROPOSAL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
                <Button className="w-full" onClick={handleCreate} disabled={creating || !newTitle.trim()}>
                  {creating ? "Creating..." : "Create Proposal"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            placeholder="Search proposals..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 h-9 w-64"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {PROPOSAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Proposals Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
              <p className="text-muted-foreground text-sm">No proposals found.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposals.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {p.title}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {p.proposal_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.customer?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {p.value > 0 ? `$${p.value.toLocaleString()}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                            {p.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {p.valid_until ? new Date(p.valid_until).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setSelectedId(p.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="ml-1">Edit</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-4">
                  <p className="text-muted-foreground text-xs">Page {page} of {totalPages} ({total} proposals)</p>
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
    </div>
  );
}
