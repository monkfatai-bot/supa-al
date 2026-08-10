"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Filter,
  Loader2,
  FileText,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { getIntegrationLogs } from "@/services/integration-hub/actions";
import type {
  ServiceResult,
  IntegrationLogEntry,
} from "@/services/integration-hub/types";
import type { LogStatus, EventDirection } from "@/types/generated/database";

// ── Constants ───────────────────────────────────────────────────

const PAGE_SIZE = 50;
const POLL_INTERVAL = 10_000;

// ── Helpers ──────────────────────────────────────────────────────

function getStatusIcon(status: LogStatus) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "timeout":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: LogStatus) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-[10px] px-1.5">
          Success
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-[10px] px-1.5">
          Error
        </Badge>
      );
    case "timeout":
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-[10px] px-1.5">
          Timeout
        </Badge>
      );
    default:
      return <Badge variant="secondary" className="text-[10px] px-1.5">{status}</Badge>;
  }
}

function getDirectionBadge(dir: EventDirection) {
  return dir === "inbound" ? (
    <Badge variant="outline" className="text-[10px] px-1.5 text-blue-600 border-blue-300 dark:border-blue-700">Inbound</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] px-1.5 text-violet-600 border-violet-300 dark:border-violet-700">Outbound</Badge>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function safeJsonParse(val: unknown): string {
  if (!val) return "{}";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

// ── Props ────────────────────────────────────────────────────────

interface IntegrationLogsProps {
  workspaceId: string;
}

// ── Component ────────────────────────────────────────────────────

export function IntegrationLogs({ workspaceId }: IntegrationLogsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allLogs, setAllLogs] = useState<IntegrationLogEntry[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDirection, setFilterDirection] = useState<string>("all");
  const [filterIntegration, setFilterIntegration] = useState<string>("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);

      getIntegrationLogs({ workspaceId, limit: PAGE_SIZE, offset: 0 })
        .then((res: ServiceResult<IntegrationLogEntry[]>) => {
          if (res.success && res.data) {
            setAllLogs(res.data);
          } else if (!silent) {
            setError(res.message ?? "Failed to load logs");
          }
        })
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [workspaceId]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  // ── Auto-refresh polling ───────────────────────────────────────

  useEffect(() => {
    if (autoRefresh) {
      pollRef.current = setInterval(() => fetchLogs(true), POLL_INTERVAL);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [autoRefresh, fetchLogs]);

  // ── Unique integrations for filter dropdown ────────────────────

  const integrationOptions = useMemo(() => {
    const names = new Set<string>();
    for (const log of allLogs) {
      if (log.integrationName) names.add(log.integrationName);
    }
    return Array.from(names).sort();
  }, [allLogs]);

  // ── Client-side filtering ──────────────────────────────────────

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (filterStatus !== "all" && log.status !== filterStatus) return false;
      if (filterDirection !== "all" && log.direction !== filterDirection) return false;
      if (filterIntegration !== "all" && log.integrationName !== filterIntegration) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          (log.action?.toLowerCase().includes(q) ?? false) ||
          (log.integrationName?.toLowerCase().includes(q) ?? false) ||
          (log.error_message?.toLowerCase().includes(q) ?? false);
        if (!matches) return false;
      }
      return true;
    });
  }, [allLogs, filterStatus, filterDirection, filterIntegration, searchQuery]);

  // ── Export CSV ──────────────────────────────────────────────────

  const handleExport = () => {
    const headers = ["Timestamp", "Integration", "Action", "Direction", "Status", "Duration (ms)", "Error"];
    const rows = filteredLogs.map((log) => [
      log.created_at,
      log.integrationName ?? "",
      log.action ?? "",
      log.direction,
      log.status,
      String(log.duration_ms ?? ""),
      log.error_message ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `integration-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLogs.length} log entries`);
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integration Logs</h2>
          <p className="text-muted-foreground text-sm">
            Monitor and inspect integration execution history
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            className="text-xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <ToggleRight className="mr-1.5 h-4 w-4" />
            ) : (
              <ToggleLeft className="mr-1.5 h-4 w-4" />
            )}
            Auto-refresh
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleExport}>
            <Download className="mr-1.5 h-3 w-3" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => fetchLogs()}>
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Filter Bar ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={filterIntegration} onValueChange={setFilterIntegration}>
                <SelectTrigger className="w-40 h-8 text-xs">
                  <Filter className="mr-1.5 h-3 w-3" />
                  <SelectValue placeholder="Integration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Integrations</SelectItem>
                  {integrationOptions.map((name) => (
                    <SelectItem key={name} value={name} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterDirection} onValueChange={setFilterDirection}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="timeout">Timeout</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Log Entries ──────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Log Entries</CardTitle>
              <CardDescription className="text-xs">
                {filteredLogs.length} entries
                {autoRefresh && (
                  <span className="ml-2 flex items-center gap-1 text-emerald-600">
                    <Loader2 className="h-3 w-3 animate-spin" /> live
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="text-muted-foreground mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No log entries found</p>
              <p className="text-muted-foreground text-xs mt-1">
                Try adjusting your filters or wait for integration activity
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="space-y-0.5">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedRow === log.id;
                  return (
                    <div key={log.id}>
                      {/* Row header */}
                      <button
                        className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="shrink-0">{getStatusIcon(log.status)}</div>
                        <span className="text-muted-foreground text-xs w-36 shrink-0 hidden sm:block">
                          {formatTimestamp(log.created_at)}
                        </span>
                        <span className="text-xs font-medium truncate min-w-0 flex-1 max-w-[140px]">
                          {log.integrationName ?? log.integration_id ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate max-w-[100px] hidden md:block">
                          {log.action ?? "—"}
                        </span>
                        {getDirectionBadge(log.direction)}
                        {getStatusBadge(log.status)}
                        <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                          {log.duration_ms != null ? `${log.duration_ms}ms` : "—"}
                        </span>
                        {log.error_message && (
                          <span className="text-red-500 text-xs truncate max-w-[150px] hidden lg:block">
                            {log.error_message}
                          </span>
                        )}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="ml-9 mb-2 space-y-2 rounded-md border bg-muted/30 p-3">
                          <div className="grid gap-2 text-xs sm:grid-cols-2">
                            <div>
                              <span className="text-muted-foreground">Timestamp:</span>{" "}
                              <span>{formatTimestamp(log.created_at)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Duration:</span>{" "}
                              <span>{log.duration_ms != null ? `${log.duration_ms}ms` : "N/A"}</span>
                            </div>
                          </div>
                          {log.error_message && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Error:</span>{" "}
                              <span className="text-red-600 dark:text-red-400">{log.error_message}</span>
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Request</p>
                            <pre className="rounded bg-background p-2 text-xs font-mono overflow-auto max-h-40 border">
                              {safeJsonParse(log.request)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Response</p>
                            <pre className="rounded bg-background p-2 text-xs font-mono overflow-auto max-h-40 border">
                              {safeJsonParse(log.response)}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
