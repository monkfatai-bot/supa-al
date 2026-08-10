'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getWorkflowLogs,
  getWorkflows,
  getWorkflowRuns,
} from '@/services/automation/actions';
import type {
  WorkflowLog,
  LogLevel,
  WorkflowWithRelations,
  WorkflowRunWithRelations,
} from '@/services/automation/types';
import { toast } from 'sonner';

// ── Props ────────────────────────────────────────────────────────

interface LogsViewerProps {
  workspaceId: string;
  workflowId?: string;
  runId?: string;
}

// ── Constants ────────────────────────────────────────────────────

const LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Levels' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
];

const LEVEL_BADGE: Record<LogLevel, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  debug: { variant: 'outline' },
  info: { variant: 'default' },
  warn: { variant: 'outline', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  error: { variant: 'destructive' },
};

const PAGE_SIZE = 15;

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

function safeJsonStringify(val: unknown): string {
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

// ── Component ────────────────────────────────────────────────────

export function LogsViewer({ workspaceId, workflowId: propWorkflowId, runId: propRunId }: LogsViewerProps) {
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [workflowFilter, setWorkflowFilter] = useState<string>(propWorkflowId ?? 'all');
  const [runFilter, setRunFilter] = useState<string>(propRunId ?? 'all');
  const [workflows, setWorkflows] = useState<WorkflowWithRelations[]>([]);
  const [runs, setRuns] = useState<WorkflowRunWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch filter options
  useEffect(() => {
    if (propWorkflowId && propRunId) return;
    getWorkflows({ workspaceId, page: 1, pageSize: 100, status: 'active' }).then((res) => {
      setWorkflows(res.data);
    });
  }, [workspaceId, propWorkflowId, propRunId]);

  useEffect(() => {
    if (propRunId || workflowFilter === 'all') return;
    getWorkflowRuns({ workspaceId, workflowId: workflowFilter, page: 1, pageSize: 50 }).then((res) => {
      setRuns(res.data);
    });
  }, [workspaceId, workflowFilter, propRunId]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWorkflowLogs({
        workspaceId,
        workflowId: workflowFilter !== 'all' ? workflowFilter : undefined,
        runId: runFilter !== 'all' ? runFilter : undefined,
        level: levelFilter !== 'all' ? (levelFilter as LogLevel) : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setLogs(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workflowFilter, runFilter, levelFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const resetPage = () => setPage(1);

  const handleWorkflowChange = (v: string) => {
    setWorkflowFilter(v);
    setRunFilter('all');
    resetPage();
  };

  const handleRunChange = (v: string) => {
    setRunFilter(v);
    resetPage();
  };

  const handleLevelChange = (v: string) => {
    setLevelFilter(v);
    resetPage();
  };

  // ── Loading

  if (loading && logs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!propWorkflowId && (
          <Select value={workflowFilter} onValueChange={handleWorkflowChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Workflows" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workflows</SelectItem>
              {workflows.map((wf) => (
                <SelectItem key={wf.id} value={wf.id}>{wf.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!propRunId && (
          <Select value={runFilter} onValueChange={handleRunChange}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Runs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Runs</SelectItem>
              {runs.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.workflow?.name} — {r.created_at.slice(0, 19).replace('T', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={levelFilter} onValueChange={handleLevelChange}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Logs Table */}
      {logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No logs found</p>
          <p className="text-xs mt-1">Adjust your filters or run a workflow</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[100px]">Time</TableHead>
                <TableHead className="min-w-[60px]">Level</TableHead>
                <TableHead className="min-w-[50px] text-center">Step</TableHead>
                <TableHead className="min-w-[200px]">Message</TableHead>
                <TableHead className="min-w-[70px]">Duration</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const hasDetails = log.details && (typeof log.details === 'object' ? Object.keys(log.details as object).length > 0 : false);
                const isExpanded = expandedId === log.id;

                return (
                  <>
                    <TableRow
                      key={log.id}
                      className={isExpanded ? 'bg-muted/30' : undefined}
                    >
                      <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                        {formatTimestamp(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={LEVEL_BADGE[log.level].variant}
                          className={LEVEL_BADGE[log.level].className}
                        >
                          {log.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {log.step_position != null ? log.step_position : '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px] truncate">
                        {log.message}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.duration_ms != null ? formatDuration(log.duration_ms) : '—'}
                      </TableCell>
                      <TableCell>
                        {hasDetails && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && hasDetails && (
                      <TableRow key={`${log.id}-details`}>
                        <TableCell colSpan={6} className="bg-muted/20 px-8 py-3">
                          <pre className="text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-background border p-3">
                            {safeJsonStringify(log.details)}
                          </pre>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}&ndash;{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
