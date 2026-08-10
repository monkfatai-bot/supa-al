"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Eye,
  Pencil,
  UserPlus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getLeads,
  convertLeadToCustomer,
  aiScoreLead,
} from "@/services/crm/actions";
import type {
  LeadWithRelations,
  LeadStatus,
  LeadSource,
} from "@/services/crm/types";
import { toast } from "sonner";

// ── Constants ──────────────────────────────────────────────────────

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
];

const LEAD_SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "social_media", label: "Social Media" },
  { value: "cold_call", label: "Cold Call" },
  { value: "event", label: "Event" },
  { value: "organic", label: "Organic" },
  { value: "other", label: "Other" },
];

const PAGE_SIZE = 10;

// ── Helpers ────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "new":
      return "default" as const;
    case "contacted":
      return "secondary" as const;
    case "qualified":
      return "secondary" as const;
    case "proposal":
      return "secondary" as const;
    case "negotiation":
      return "secondary" as const;
    case "won":
      return "default" as const;
    case "lost":
      return "destructive" as const;
    case "archived":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-amber-500";
  if (score > 0) return "bg-red-400";
  return "bg-muted";
}

// ── Props ──────────────────────────────────────────────────────────

interface CrmLeadsListProps {
  workspaceId: string;
}

// ── Component ──────────────────────────────────────────────────────

export function CrmLeadsList({ workspaceId }: CrmLeadsListProps) {
  const [leads, setLeads] = useState<LeadWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Action states
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [scoringId, setScoringId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLeads = useCallback(() => {
    setLoading(true);

    const options: Parameters<typeof getLeads>[0] = {
      workspaceId,
      page,
      pageSize: PAGE_SIZE,
    };

    if (statusFilter !== "all") {
      options.status = statusFilter as LeadStatus;
    }
    if (sourceFilter !== "all") {
      options.source = sourceFilter as LeadSource;
    }

    getLeads(options)
      .then((res) => {
        if (res.success && res.data) {
          setLeads(res.data);
          setTotal(res.total ?? 0);
        } else {
          setLeads([]);
          setTotal(0);
        }
      })
      .catch(() => {
        setLeads([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [workspaceId, page, statusFilter, sourceFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads();
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [statusFilter, sourceFilter, search]);

  // Client-side search filter (applied on top of server results)
  const filteredLeads = search.trim()
    ? leads.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          l.company?.name?.toLowerCase().includes(search.toLowerCase()) ||
          l.assignee?.full_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : leads;

  async function handleConvert(leadId: string) {
    setConvertingId(leadId);
    const res = await convertLeadToCustomer(leadId);
    if (res.success) {
      toast.success("Lead converted to customer");
      fetchLeads();
    } else {
      toast.error(res.message || "Failed to convert lead");
    }
    setConvertingId(null);
  }

  async function handleAiScore(leadId: string) {
    setScoringId(leadId);
    const res = await aiScoreLead(leadId, workspaceId);
    if (res.success && res.result) {
      toast.success(`Score: ${res.result.score}/100 — ${res.result.reasoning}`);
      fetchLeads();
    } else {
      toast.error(res.message || "AI scoring failed");
    }
    setScoringId(null);
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
            placeholder="Search leads..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {LEAD_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {LEAD_SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <TableHead className="min-w-[180px]">Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="min-w-[100px]">Score</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-muted-foreground text-center">
                      No leads found.
                    </TableCell>
                  </TableRow>
                )}
                {filteredLeads.map((lead) => {
                  const score = lead.score ?? 0;
                  return (
                    <TableRow key={lead.id}>
                      {/* Title */}
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{lead.title}</p>
                          {lead.company && (
                            <p className="text-muted-foreground truncate text-xs">
                              {lead.company.name}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Source */}
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">
                          {lead.source.replace("_", " ")}
                        </Badge>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant={getStatusBadgeVariant(lead.status)}
                          className="text-xs capitalize"
                        >
                          {lead.status}
                        </Badge>
                      </TableCell>

                      {/* Score */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="bg-muted h-2 w-16 overflow-hidden rounded-full">
                            <div
                              className={`h-full rounded-full transition-all ${getScoreColor(score)}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground text-xs">{score}</span>
                        </div>
                      </TableCell>

                      {/* Value */}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(lead.value)}
                      </TableCell>

                      {/* Assigned To */}
                      <TableCell className="text-muted-foreground text-sm">
                        {lead.assignee?.full_name ?? "—"}
                      </TableCell>

                      {/* Created */}
                      <TableCell className="text-muted-foreground text-xs">
                        {formatDate(lead.created_at)}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <span className="sr-only">Actions</span>
                              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                                <circle cx="3" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                                <circle cx="13" cy="8" r="1.5" fill="currentColor" />
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleConvert(lead.id)}
                              disabled={convertingId === lead.id || lead.status === "won"}
                            >
                              {convertingId === lead.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <UserPlus className="mr-2 h-4 w-4" />
                              )}
                              Convert to Customer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleAiScore(lead.id)}
                              disabled={scoringId === lead.id}
                            >
                              {scoringId === lead.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                              )}
                              AI Score
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
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
