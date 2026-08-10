'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Square,
  RotateCcw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
  getWorkflowRuns,
  stopRun,
  retryRun,
  getWorkflows,
} from '@/services/automation/actions';
import type {
  WorkflowRunWithRelations,
  WorkflowRunStatus,
  WorkflowWithRelations,
} from '@/services/automation/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// ── Props ────────────────────────────────────────────────────────

interface RunHistoryProps {
  workspaceId: string;
  workflowId?: string;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'waiting', label: 'Waiting' },
];

const STATUS_VARIANT: Record<WorkflowRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  waiting: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
  retrying: 'secondary',
};

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Component ────────────────────────────────────────────────────

export function RunHistory({ workspaceId, workflowId: propWorkflowId }: RunHistoryProps) {
  const [runs, setRuns] = useState<WorkflowRunWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workflowFilter, setWorkflowFilter] = useState<string>(propWorkflowId ?? 'all');
  const [workflows, setWorkflows] = useState<WorkflowWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch workflow options (only when no propWorkflowId)
  useEffect(() => {
    if (propWorkflowId) return;
    getWorkflows({ workspaceId, page: 1, pageSize: 100, status: 'active' }).then((res) => {
      setWorkflows(res.data);
    }).catch(() => {});
  }, [workspaceId, propWorkflowId]);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWorkflowRuns({
        workspaceId,
        workflowId: workflowFilter !== 'all' ? workflowFilter : undefined,
        status: statusFilter !== 'all' ? (statusFilter as WorkflowRunStatus) : undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setRuns(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load run history');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, workflowFilter, statusFilter, page]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleStop = async (runId: string) => {
    setActionLoading(runId);
    const res = await stopRun(runId, workspaceId);
    if (res.success) {
      toast.success('Run stopped');
      fetchRuns();
    } else {
      toast.error(res.message);
    }
    setActionLoading(null);
  };

  const handleRetry = async (runId: string) => {
    setActionLoading(runId);
    const res = await retryRun(runId, workspaceId);
    if (res.success) {
      toast.success('Run retried');
      fetchRuns();
    } else {
      toast.error(res.message);
    }
    setActionLoading(null);
  };

  // ── Loading

  if (loading && runs.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!propWorkflowId && (
          <Select value={workflowFilter} onValueChange={(v) => { setWorkflowFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[200px]">
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

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {runs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No runs found</p>
          <p className="text-xs mt-1">Adjust your filters or run a workflow</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Workflow</TableHead>
                <TableHead className="min-w-[80px]">Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="min-w-[100px]">Started</TableHead>
                <TableHead className="min-w-[80px]">Duration</TableHead>
                <TableHead className="text-center">Retries</TableHead>
                <TableHead className="min-w-[120px]">Error</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">
                    {run.workflow?.name ?? 'Unknown'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {run.trigger?.trigger_type ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {run.duration_ms != null ? formatDuration(run.duration_ms) : '—'}
                  </TableCell>
                  <TableCell className="text-center">{run.retry_count ?? 0}</TableCell>
                  <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                    {run.error_message || ''}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(run.status === 'running' || run.status === 'retrying') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleStop(run.id)}
                          disabled={actionLoading === run.id}
                        >
                          {actionLoading === run.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Square className="mr-1 h-3 w-3" />}
                          Stop
                        </Button>
                      )}
                      {run.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleRetry(run.id)}
                          disabled={actionLoading === run.id}
                        >
                          {actionLoading === run.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RotateCcw className="mr-1 h-3 w-3" />}
                          Retry
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="View Logs">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
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
