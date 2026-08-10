'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Activity,
  Play,
  AlertTriangle,
  Clock,
  CalendarClock,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAutomationMetrics, getWorkflowRuns } from '@/services/automation/actions';
import type { AutomationMetrics, WorkflowRunWithRelations, WorkflowRunStatus } from '@/services/automation/types';
import { formatDistanceToNow } from 'date-fns';

// ── Props ────────────────────────────────────────────────────────

interface AutomationDashboardProps {
  workspaceId: string;
}

// ── Constants ────────────────────────────────────────────────────

const RUN_STATUS_VARIANT: Record<WorkflowRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  waiting: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
  retrying: 'secondary',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Metric Card ──────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
}

function MetricCard({ title, value, icon, description }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Component ────────────────────────────────────────────────────

export function AutomationDashboard({ workspaceId }: AutomationDashboardProps) {
  const [metrics, setMetrics] = useState<AutomationMetrics | null>(null);
  const [recentRuns, setRecentRuns] = useState<WorkflowRunWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [metricsRes, runsRes] = await Promise.all([
        getAutomationMetrics(workspaceId),
        getWorkflowRuns({ workspaceId, page: 1, pageSize: 10 }),
      ]);

      if (metricsRes.success && metricsRes.data) {
        setMetrics(metricsRes.data);
      }
      setRecentRuns(runsRes.data);
    } catch {
      // Silently fail — metrics will show zeros
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // ── Loading state

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-2" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  const m = metrics ?? {
    totalWorkflows: 0,
    activeWorkflows: 0,
    totalRuns: 0,
    runningRuns: 0,
    failedRuns: 0,
    avgExecutionMs: 0,
    retryCount: 0,
    scheduledJobs: 0,
    activeScheduledJobs: 0,
  };

  return (
    <div className="space-y-6">
      {/* Metrics Grid — 3x2 desktop, 2x3 tablet, 1x6 mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="Total Workflows"
          value={m.totalWorkflows}
          icon={<Zap className="h-4 w-4" />}
          description={`${m.activeWorkflows} active`}
        />
        <MetricCard
          title="Active Workflows"
          value={m.activeWorkflows}
          icon={<Activity className="h-4 w-4" />}
          description={`${m.totalWorkflows - m.activeWorkflows} inactive`}
        />
        <MetricCard
          title="Total Runs"
          value={m.totalRuns}
          icon={<Play className="h-4 w-4" />}
          description={`${m.runningRuns} currently running`}
        />
        <MetricCard
          title="Failed Runs"
          value={m.failedRuns}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={m.totalRuns > 0 ? `${((m.failedRuns / m.totalRuns) * 100).toFixed(1)}% failure rate` : 'No runs yet'}
        />
        <MetricCard
          title="Avg Execution Time"
          value={formatDuration(m.avgExecutionMs)}
          icon={<Clock className="h-4 w-4" />}
          description="Across completed runs"
        />
        <MetricCard
          title="Scheduled Jobs"
          value={m.scheduledJobs}
          icon={<CalendarClock className="h-4 w-4" />}
          description={`${m.activeScheduledJobs} active`}
        />
      </div>

      {/* Recent Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Runs</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No workflow runs yet</p>
              <p className="text-xs mt-1">Create a workflow and run it to see results here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[140px]">Workflow</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[100px]">Started</TableHead>
                    <TableHead className="min-w-[80px]">Duration</TableHead>
                    <TableHead className="min-w-[60px]">Retries</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">
                        {run.workflow?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={RUN_STATUS_VARIANT[run.status] ?? 'secondary'}>
                          {run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {run.created_at
                          ? formatDistanceToNow(new Date(run.created_at), { addSuffix: true })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {run.duration_ms != null ? formatDuration(run.duration_ms) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        {run.retry_count ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
