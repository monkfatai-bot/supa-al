'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  getScheduledJobs,
  updateScheduledJob,
  deleteScheduledJob,
} from '@/services/automation/actions';
import type {
  ScheduledJob,
  ScheduledJobStatus,
  ScheduleType,
} from '@/services/automation/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CreateScheduleDialog } from './create-schedule-dialog';

// ── Props ────────────────────────────────────────────────────────

interface SchedulerManagerProps {
  workspaceId: string;
}

// ── Constants ────────────────────────────────────────────────────

const SCHEDULE_TYPE_BADGE: Record<ScheduleType, 'default' | 'secondary' | 'outline'> = {
  once: 'outline',
  daily: 'default',
  weekly: 'default',
  monthly: 'secondary',
  cron: 'secondary',
};

const JOB_STATUS_BADGE: Record<ScheduledJobStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  active: 'default',
  paused: 'outline',
  completed: 'secondary',
  failed: 'destructive',
  cancelled: 'outline',
};

const PAGE_SIZE = 10;

// ── Component ────────────────────────────────────────────────────

export function SchedulerManager({ workspaceId }: SchedulerManagerProps) {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getScheduledJobs({ workspaceId, page, pageSize: PAGE_SIZE });
      setJobs(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load scheduled jobs');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleTogglePause = async (job: ScheduledJob) => {
    setActionLoading(job.id);
    const newStatus: ScheduledJobStatus = job.status === 'active' ? 'paused' : 'active';
    const res = await updateScheduledJob(job.id, workspaceId, { status: newStatus });
    if (res.success) {
      toast.success(newStatus === 'paused' ? 'Job paused' : 'Job resumed');
      fetchJobs();
    } else {
      toast.error(res.message);
    }
    setActionLoading(null);
  };

  const handleDelete = async (id: string) => {
    setActionLoading(id);
    const res = await deleteScheduledJob(id, workspaceId);
    if (res.success) {
      toast.success('Scheduled job deleted');
      fetchJobs();
    } else {
      toast.error(res.message);
    }
    setActionLoading(null);
  };

  // ── Loading

  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Scheduled Jobs</h3>
        <CreateScheduleDialog
          workspaceId={workspaceId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={fetchJobs}
        >
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Schedule Job
          </Button>
        </CreateScheduleDialog>
      </div>

      {/* Table */}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Plus className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No scheduled jobs</p>
          <p className="text-xs mt-1">Create a schedule to run workflows automatically</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Name</TableHead>
                <TableHead className="min-w-[120px]">Workflow</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="min-w-[100px]">Cron</TableHead>
                <TableHead className="min-w-[80px]">Timezone</TableHead>
                <TableHead className="min-w-[90px]">Last Run</TableHead>
                <TableHead className="min-w-[90px]">Next Run</TableHead>
                <TableHead className="text-center">Runs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                // Access the joined workflow name
                const wfName = (job as unknown as Record<string, unknown>).workflows
                  ? ((job as unknown as Record<string, unknown>).workflows as { name: string }).name
                  : 'Unknown';

                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">{job.name}</TableCell>
                    <TableCell className="text-sm">{wfName}</TableCell>
                    <TableCell>
                      <Badge variant={SCHEDULE_TYPE_BADGE[job.schedule_type]}>
                        {job.schedule_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {job.cron_expression || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.timezone}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.last_run_at
                        ? formatDistanceToNow(new Date(job.last_run_at), { addSuffix: true })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.next_run_at
                        ? formatDistanceToNow(new Date(job.next_run_at), { addSuffix: true })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-center">{job.run_count}</TableCell>
                    <TableCell>
                      <Badge variant={JOB_STATUS_BADGE[job.status]}>{job.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleTogglePause(job)}
                          disabled={actionLoading === job.id || job.status === 'completed'}
                          title={job.status === 'active' ? 'Pause' : 'Resume'}
                        >
                          {actionLoading === job.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : job.status === 'active' ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingJob(job)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(job.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
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

      {/* Edit Dialog (reuse CreateScheduleDialog in edit mode) */}
      <CreateScheduleDialog
        workspaceId={workspaceId}
        open={!!editingJob}
        onOpenChange={(open) => { if (!open) setEditingJob(null); }}
        onCreated={fetchJobs}
        editJob={editingJob ?? undefined}
      />
    </div>
  );
}
