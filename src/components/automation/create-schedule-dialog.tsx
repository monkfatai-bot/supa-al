'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  createScheduledJob,
  updateScheduledJob,
  getWorkflows,
} from '@/services/automation/actions';
import type { ScheduleType, ScheduledJob, WorkflowWithRelations } from '@/services/automation/types';
import { toast } from 'sonner';

// ── Props ────────────────────────────────────────────────────────

interface CreateScheduleDialogProps {
  workspaceId: string;
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCreated?: () => void;
  editJob?: ScheduledJob;
}

// ── Constants ────────────────────────────────────────────────────

const SCHEDULE_TYPES: { value: ScheduleType; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'cron', label: 'Cron Expression' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

// ── Component ────────────────────────────────────────────────────

export function CreateScheduleDialog({
  workspaceId,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onCreated,
  editJob,
}: CreateScheduleDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange ?? (() => {})) : setInternalOpen;

  const [name, setName] = useState(editJob?.name ?? '');
  const [workflowId, setWorkflowId] = useState(editJob?.workflow_id ?? '');
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    editJob?.schedule_type ?? 'daily',
  );
  const [cronExpression, setCronExpression] = useState(editJob?.cron_expression ?? '');
  const [timezone, setTimezone] = useState(editJob?.timezone ?? 'UTC');
  const [maxRuns, setMaxRuns] = useState(editJob?.max_runs?.toString() ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowWithRelations[]>([]);

  // Reset form when editJob changes
  useEffect(() => {
    if (editJob) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(editJob.name);
      setWorkflowId(editJob.workflow_id);
      setScheduleType(editJob.schedule_type);
      setCronExpression(editJob.cron_expression);
      setTimezone(editJob.timezone);
      setMaxRuns(editJob.max_runs?.toString() ?? '');
    }
  }, [editJob]);

  // Fetch active workflows
  useEffect(() => {
    getWorkflows({ workspaceId, page: 1, pageSize: 100, status: 'active' }).then(
      (res) => setWorkflows(res.data),
    );
  }, [workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workflowId) return;

    setSubmitting(true);
    const data = {
      name,
      scheduleType,
      cronExpression: scheduleType === 'cron' ? cronExpression : undefined,
      timezone,
      maxRuns: maxRuns ? parseInt(maxRuns, 10) : undefined,
    };

    let res;
    if (editJob) {
      res = await updateScheduledJob(editJob.id, workspaceId, data);
    } else {
      res = await createScheduledJob(workflowId, workspaceId, data);
    }

    if (res.success) {
      toast.success(editJob ? 'Schedule updated' : 'Schedule created');
      setOpen(false);
      onCreated?.();
    } else {
      toast.error(res.message);
    }
    setSubmitting(false);
  };

  const showCron = scheduleType === 'cron';
  const isValid = name.trim() && workflowId && (!showCron || cronExpression.trim());

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editJob ? 'Edit Schedule' : 'Create Schedule'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="sched-name">Schedule Name</Label>
            <Input
              id="sched-name"
              placeholder="e.g. Daily Lead Sync"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Workflow */}
          <div className="space-y-2">
            <Label>Workflow</Label>
            <Select value={workflowId} onValueChange={setWorkflowId} disabled={submitting}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((wf) => (
                  <SelectItem key={wf.id} value={wf.id}>
                    {wf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule Type */}
          <div className="space-y-2">
            <Label>Schedule Type</Label>
            <Select
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as ScheduleType)}
              disabled={submitting}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCHEDULE_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cron Expression (conditional) */}
          {showCron && (
            <div className="space-y-2">
              <Label htmlFor="sched-cron">Cron Expression</Label>
              <Input
                id="sched-cron"
                placeholder="0 9 * * MON-FRI"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Standard cron syntax (minute hour day month weekday)
              </p>
            </div>
          )}

          {/* Timezone */}
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={submitting}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Runs */}
          <div className="space-y-2">
            <Label htmlFor="sched-max">Max Runs (optional)</Label>
            <Input
              id="sched-max"
              type="number"
              min="1"
              placeholder="Leave empty for unlimited"
              value={maxRuns}
              onChange={(e) => setMaxRuns(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" disabled={!isValid || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editJob ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
