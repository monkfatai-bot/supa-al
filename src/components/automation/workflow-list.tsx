'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getWorkflows,
  deleteWorkflow,
} from '@/services/automation/actions';
import type { WorkflowWithRelations, WorkflowStatus, WorkflowRunStatus } from '@/services/automation/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CreateWorkflowDialog } from './create-workflow-dialog';

// ── Props ────────────────────────────────────────────────────────

interface WorkflowListProps {
  workspaceId: string;
  onSelectWorkflow?: (workflowId: string) => void;
}

// ── Constants ────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_BADGE_VARIANT: Record<WorkflowStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  archived: 'outline',
};

const RUN_STATUS_BADGE_VARIANT: Record<WorkflowRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  waiting: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
  retrying: 'secondary',
};

const PAGE_SIZE = 10;

// ── Component ────────────────────────────────────────────────────

export function WorkflowList({ workspaceId, onSelectWorkflow }: WorkflowListProps) {
  const [workflows, setWorkflows] = useState<WorkflowWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getWorkflows({
        workspaceId,
        page,
        pageSize: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter !== 'all' ? (statusFilter as WorkflowStatus) : undefined,
      });
      setWorkflows(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, search, statusFilter]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteWorkflow(id, workspaceId);
    if (res.success) {
      toast.success(res.message);
      fetchWorkflows();
    } else {
      toast.error(res.message);
    }
    setDeletingId(null);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchWorkflows();
  };

  // ── Loading skeleton

  if (loading && workflows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search, Filter, Create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search workflows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            Search
          </Button>
        </form>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <CreateWorkflowDialog
          workspaceId={workspaceId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={fetchWorkflows}
        >
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Workflow
          </Button>
        </CreateWorkflowDialog>
      </div>

      {/* Table */}
      {workflows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No workflows found</p>
          <p className="text-xs mt-1">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter'
              : 'Create your first workflow to get started'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Triggers</TableHead>
                <TableHead className="text-center">Actions</TableHead>
                <TableHead className="text-center">Runs</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((wf) => (
                <TableRow
                  key={wf.id}
                  className="cursor-pointer"
                  onClick={() => onSelectWorkflow?.(wf.id)}
                >
                  <TableCell>
                    <div className="font-medium">{wf.name}</div>
                    {wf.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {wf.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[wf.status]}>
                      {wf.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{wf.triggerCount ?? 0}</TableCell>
                  <TableCell className="text-center">{wf.actionCount ?? 0}</TableCell>
                  <TableCell className="text-center">{wf.runCount ?? 0}</TableCell>
                  <TableCell>
                    {wf.lastRunAt ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={RUN_STATUS_BADGE_VARIANT[wf.lastRunStatus ?? 'pending']} className="text-xs">
                          {wf.lastRunStatus}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(wf.lastRunAt), { addSuffix: true })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild onClick={(e) => e.stopPropagation()}>
                          <Link href={`/automation/workflows/${wf.id}/builder`} className="flex items-center">
                            <Workflow className="mr-2 h-4 w-4" />
                            Open Builder
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelectWorkflow?.(wf.id); }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                          disabled={deletingId === wf.id}
                        >
                          {deletingId === wf.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
