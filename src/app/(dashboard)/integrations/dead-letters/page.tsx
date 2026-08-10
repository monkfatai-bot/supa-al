"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  getDeadLetterQueue,
  replayDeadLetterEvent,
  replayAllDeadLetters,
} from "@/services/integration-hub";
import type { ServiceResult, DeadLetterEntry } from "@/services/integration-hub";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MailWarning,
  RotateCcw,
  Play,
  Inbox,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "replaying", label: "Replaying" },
  { value: "resolved", label: "Resolved" },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
    case "dead":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "replaying":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "resolved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── Component ──────────────────────────────────────────────────

export default function DeadLettersPage() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayingAllWebhookId, setReplayingAllWebhookId] = useState<
    string | null
  >(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [webhookFilter, setWebhookFilter] = useState("all");

  // Fetch dead letters
  const fetchData = useCallback(async () => {
    if (!workspace?.id) return;
    setIsLoading(true);
    try {
      const result: ServiceResult<DeadLetterEntry[]> = await getDeadLetterQueue(
        workspace.id
      );
      if (result.success && result.data) {
        setDeadLetters(result.data);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive unique webhook IDs for the filter dropdown
  const webhookIds = useMemo(() => {
    const ids = new Set(deadLetters.map((dl) => dl.webhook_id));
    return Array.from(ids);
  }, [deadLetters]);

  // Stats
  const { total, unresolved, resolved } = useMemo(() => {
    const t = deadLetters.length;
    const u = deadLetters.filter(
      (dl) => dl.status !== "resolved"
    ).length;
    const r = deadLetters.filter(
      (dl) => dl.status === "resolved"
    ).length;
    return { total: t, unresolved: u, resolved: r };
  }, [deadLetters]);

  // Filtered list
  const filteredDeadLetters = useMemo(() => {
    return deadLetters.filter((dl) => {
      const matchesStatus =
        statusFilter === "all" || dl.status === statusFilter;
      const matchesWebhook =
        webhookFilter === "all" || dl.webhook_id === webhookFilter;
      return matchesStatus && matchesWebhook;
    });
  }, [deadLetters, statusFilter, webhookFilter]);

  // Count dead letters per webhook (for replay all)
  const getWebhookDeadCount = useCallback(
    (webhookId: string) => {
      return deadLetters.filter(
        (dl) => dl.webhook_id === webhookId && dl.status !== "resolved"
      ).length;
    },
    [deadLetters]
  );

  const handleReplay = useCallback(
    async (deadLetterId: string) => {
      setReplayingId(deadLetterId);
      try {
        const result = await replayDeadLetterEvent(deadLetterId);
        if (result.success) {
          toast.success(result.message || "Event replayed successfully");
          await fetchData();
        } else {
          toast.error(result.message || "Replay failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setReplayingId(null);
      }
    },
    [fetchData]
  );

  const handleReplayAll = useCallback(
    async (webhookId: string) => {
      setReplayingAllWebhookId(webhookId);
      try {
        const result = await replayAllDeadLetters(webhookId);
        if (result.success) {
          toast.success(result.message || "Bulk replay completed");
          await fetchData();
        } else {
          toast.error(result.message || "Bulk replay failed");
        }
      } catch {
        toast.error("Something went wrong");
      } finally {
        setReplayingAllWebhookId(null);
      }
    },
    [fetchData]
  );

  if (wsLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Dead Letter Queue
        </h1>
        <p className="text-muted-foreground">
          Review and replay failed webhook deliveries from your integrations.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              Total Dead Letters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              Unresolved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {unresolved}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {resolved}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
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
        {webhookIds.length > 0 && (
          <Select value={webhookFilter} onValueChange={setWebhookFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Webhook" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Webhooks</SelectItem>
              {webhookIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id.slice(0, 12)}…
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Dead Letter Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailWarning className="h-4 w-4" />
            Dead Letter Events
          </CardTitle>
          <CardDescription>
            Events that failed delivery and were moved to the dead letter queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredDeadLetters.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-1">
                No dead letters found
              </h3>
              <p className="text-muted-foreground text-sm text-center max-w-sm">
                {deadLetters.length === 0
                  ? "No failed webhook events have been recorded."
                  : "No dead letters match the current filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead className="hidden md:table-cell">Webhook</TableHead>
                    <TableHead className="hidden lg:table-cell max-w-[200px]">
                      Error
                    </TableHead>
                    <TableHead className="text-center">Attempts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Created
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeadLetters.map((dl) => {
                    const isResolved = dl.status === "resolved";
                    const dlWebhookCount = getWebhookDeadCount(dl.webhook_id);
                    return (
                      <TableRow key={dl.id}>
                        <TableCell className="font-medium">
                          {dl.event_type}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {dl.webhook_id.slice(0, 12)}…
                        </TableCell>
                        <TableCell
                          className="hidden lg:table-cell max-w-[200px] truncate text-xs text-muted-foreground"
                          title={dl.failure_reason || dl.original_error}
                        >
                          {dl.failure_reason || dl.original_error}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-sm font-medium ${
                              dl.attempt_count > 3
                                ? "text-red-500"
                                : "text-muted-foreground"
                            }`}
                          >
                            {dl.attempt_count}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={statusBadgeClass(dl.status)}
                          >
                            {dl.status === "pending" || dl.status === "dead"
                              ? "dead"
                              : dl.status === "replaying"
                                ? "replaying"
                                : "resolved"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(dl.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {!isResolved && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReplay(dl.id)}
                                  disabled={replayingId === dl.id}
                                  title="Replay this event"
                                >
                                  <Play className="h-3.5 w-3.5 mr-1" />
                                  {replayingId === dl.id
                                    ? "…"
                                    : "Replay"}
                                </Button>
                                {dlWebhookCount > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleReplayAll(dl.webhook_id)
                                    }
                                    disabled={
                                      replayingAllWebhookId === dl.webhook_id
                                    }
                                    title={`Replay all ${dlWebhookCount} unresolved for this webhook`}
                                  >
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                    {replayingAllWebhookId === dl.webhook_id
                                      ? "…"
                                      : "All"}
                                  </Button>
                                )}
                              </>
                            )}
                            {isResolved && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <Clock className="h-3 w-3" />
                                {dl.resolved_at
                                  ? formatDate(dl.resolved_at)
                                  : "—"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
