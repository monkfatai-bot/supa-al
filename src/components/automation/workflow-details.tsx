'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  Pencil,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Loader2,
  Save,
  X,
  GripVertical,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  createAction,
  updateAction,
  deleteAction,
  upsertVariable,
  deleteVariable,
  runWorkflow,
  getWorkflowRuns,
} from '@/services/automation/actions';
import type {
  WorkflowDetail,
  WorkflowStatus,
  TriggerType,
  ActionType,
  VariableScope,
  WorkflowRunStatus,
} from '@/services/automation/types';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

// ── Props ────────────────────────────────────────────────────────

interface WorkflowDetailsProps {
  workflowId: string;
  workspaceId: string;
  onBack?: () => void;
}

// ── Constants ────────────────────────────────────────────────────

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'manual', label: 'Manual' },
];

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'ai_chat', label: 'AI Chat' },
  { value: 'generate_image', label: 'Generate Image' },
  { value: 'generate_video', label: 'Generate Video' },
  { value: 'generate_voice', label: 'Generate Voice' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'update_crm', label: 'Update CRM' },
  { value: 'create_invoice', label: 'Create Invoice' },
  { value: 'update_database', label: 'Update Database' },
  { value: 'http_request', label: 'HTTP Request' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'delay', label: 'Delay' },
  { value: 'condition', label: 'Condition' },
  { value: 'loop', label: 'Loop' },
  { value: 'custom', label: 'Custom' },
];

const VARIABLE_SCOPES: { value: VariableScope; label: string }[] = [
  { value: 'global', label: 'Global' },
  { value: 'local', label: 'Local' },
  { value: 'environment', label: 'Environment' },
];

const RUN_STATUS_VARIANT: Record<WorkflowRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  waiting: 'secondary',
  completed: 'default',
  failed: 'destructive',
  cancelled: 'outline',
  retrying: 'secondary',
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({
  workflow,
  workspaceId,
  onRun,
  running,
}: {
  workflow: WorkflowDetail;
  workspaceId: string;
  onRun: () => void;
  running: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await updateWorkflow(workflow.id, workspaceId, { name, description });
    if (res.success) {
      toast.success('Workflow updated');
      setEditing(false);
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const statusVariant: Record<WorkflowStatus, 'default' | 'secondary' | 'outline'> = {
    draft: 'secondary',
    active: 'default',
    paused: 'outline',
    archived: 'outline',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <textarea
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{workflow.name}</h3>
                <Badge variant={statusVariant[workflow.status]}>{workflow.status}</Badge>
              </div>
              {workflow.description && (
                <p className="text-sm text-muted-foreground">{workflow.description}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {workflow.tags && Array.isArray(workflow.tags) && workflow.tags.map((tag: string) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/automation/workflows/${workflow.id}/builder`}>
              <Workflow className="mr-2 h-4 w-4" />
              Open Builder
            </Link>
          </Button>
          <Button size="sm" onClick={onRun} disabled={running || workflow.status === 'archived'}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Run Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Execution Mode</div><div className="text-lg font-semibold capitalize mt-1">{workflow.execution_mode}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Triggers</div><div className="text-lg font-semibold mt-1">{workflow.triggers?.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Actions</div><div className="text-lg font-semibold mt-1">{workflow.actions?.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Variables</div><div className="text-lg font-semibold mt-1">{workflow.variables?.length ?? 0}</div></CardContent></Card>
      </div>
    </div>
  );
}

// ── Triggers Tab ─────────────────────────────────────────────────

function TriggersTab({
  workflow,
  workspaceId,
  onRefresh,
}: {
  workflow: WorkflowDetail;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerType>('event');
  const [eventName, setEventName] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setTriggerType('event');
    setEventName('');
    setAdding(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    let res;
    if (editId) {
      res = await updateTrigger(editId, workspaceId, { name, triggerType, eventName });
    } else {
      res = await createTrigger(workflow.id, workspaceId, { name, triggerType, eventName });
    }
    if (res.success) {
      toast.success(editId ? 'Trigger updated' : 'Trigger created');
      resetForm();
      onRefresh();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleEdit = (t: { id: string; name: string; trigger_type: TriggerType; event_name?: string }) => {
    setEditId(t.id);
    setName(t.name);
    setTriggerType(t.trigger_type);
    setEventName(t.event_name ?? '');
    setAdding(true);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteTrigger(id, workspaceId);
    if (res.success) {
      toast.success('Trigger deleted');
      onRefresh();
    } else {
      toast.error(res.message);
    }
  };

  const triggers = workflow.triggers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Triggers ({triggers.length})</h4>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Trigger
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder="Trigger name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {triggerType === 'event' && (
              <Input placeholder="Event name (e.g. lead.created)" value={eventName} onChange={(e) => setEventName(e.target.value)} />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {editId ? 'Update' : 'Create'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {triggers.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No triggers configured</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Order</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {triggers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><Badge variant="outline">{t.trigger_type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.event_name || '—'}</TableCell>
                  <TableCell className="text-center">{t.sort_order}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Actions Tab ──────────────────────────────────────────────────

function ActionsTab({
  workflow,
  workspaceId,
  onRefresh,
}: {
  workflow: WorkflowDetail;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [actionType, setActionType] = useState<ActionType>('custom');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setName('');
    setActionType('custom');
    setAdding(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    let res;
    if (editId) {
      res = await updateAction(editId, workspaceId, { name, actionType });
    } else {
      res = await createAction(workflow.id, workspaceId, { name, actionType });
    }
    if (res.success) {
      toast.success(editId ? 'Action updated' : 'Action created');
      resetForm();
      onRefresh();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleEdit = (a: { id: string; name: string; action_type: ActionType }) => {
    setEditId(a.id);
    setName(a.name);
    setActionType(a.action_type);
    setAdding(true);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteAction(id, workspaceId);
    if (res.success) {
      toast.success('Action deleted');
      onRefresh();
    } else {
      toast.error(res.message);
    }
  };

  const handleMove = async (actionId: string, direction: 'up' | 'down') => {
    const actions = [...(workflow.actions ?? [])].sort(
      (a, b) => a.step_position - b.step_position,
    );
    const idx = actions.findIndex((a) => a.id === actionId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= actions.length) return;

    const newPos = actions[swapIdx].step_position;
    const oldPos = actions[idx].step_position;
    await Promise.all([
      updateAction(actionId, workspaceId, { stepPosition: newPos }),
      updateAction(actions[swapIdx].id, workspaceId, { stepPosition: oldPos }),
    ]);
    onRefresh();
  };

  const sortedActions = [...(workflow.actions ?? [])].sort(
    (a, b) => a.step_position - b.step_position,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Actions ({sortedActions.length})</h4>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Action
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <Input placeholder="Action name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={actionType} onValueChange={(v) => setActionType(v as ActionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!name.trim() || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {editId ? 'Update' : 'Create'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sortedActions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No actions configured</p>
      ) : (
        <div className="space-y-2">
          {sortedActions.map((action, idx) => (
            <Card key={action.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground w-6 text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{action.name}</div>
                    <Badge variant="outline" className="text-xs mt-1">{action.action_type}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => handleMove(action.id, 'up')}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => handleMove(action.id, 'down')}
                      disabled={idx === sortedActions.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(action)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(action.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Variables Tab ────────────────────────────────────────────────

function VariablesTab({
  workflow,
  workspaceId,
  onRefresh,
}: {
  workflow: WorkflowDetail;
  workspaceId: string;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [varName, setVarName] = useState('');
  const [varValue, setVarValue] = useState('');
  const [varScope, setVarScope] = useState<VariableScope>('local');
  const [saving, setSaving] = useState(false);

  const variables = workflow.variables ?? [];

  const resetForm = () => {
    setVarName('');
    setVarValue('');
    setVarScope('local');
    setAdding(false);
  };

  const handleSave = async () => {
    if (!varName.trim()) return;
    setSaving(true);
    const res = await upsertVariable(workflow.id, workspaceId, {
      name: varName,
      value: varValue,
      scope: varScope,
    });
    if (res.success) {
      toast.success('Variable saved');
      resetForm();
      onRefresh();
    } else {
      toast.error(res.message);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const res = await deleteVariable(id, workspaceId);
    if (res.success) {
      toast.success('Variable deleted');
      onRefresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Variables ({variables.length})</h4>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Variable
          </Button>
        )}
      </div>

      {adding && (
        <Card className="border-dashed">
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input placeholder="variable_name" value={varName} onChange={(e) => setVarName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input placeholder="value" value={varValue} onChange={(e) => setVarValue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Scope</Label>
                <Select value={varScope} onValueChange={(v) => setVarScope(v as VariableScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VARIABLE_SCOPES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={!varName.trim() || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}><X className="mr-2 h-4 w-4" />Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No variables defined</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variables.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-sm">{v.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {typeof v.value === 'string' ? v.value : JSON.stringify(v.value)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{v.scope}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── History Tab ──────────────────────────────────────────────────

function HistoryTab({ workflowId, workspaceId }: { workflowId: string; workspaceId: string }) {
  const [runs, setRuns] = useState<Array<{
    id: string; status: WorkflowRunStatus; created_at: string; duration_ms: number | null; retry_count: number | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getWorkflowRuns({ workspaceId, workflowId, page: 1, pageSize: 20 }).then((res) => {
      setRuns(res.data);
      setLoading(false);
    });
  }, [workflowId, workspaceId]);

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No runs yet</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Retries</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Badge variant={RUN_STATUS_VARIANT[run.status]}>{run.status}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-sm">{run.duration_ms != null ? formatDuration(run.duration_ms) : '—'}</TableCell>
              <TableCell className="text-center">{run.retry_count ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────

export function WorkflowDetails({ workflowId, workspaceId, onBack }: WorkflowDetailsProps) {
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchWorkflow = useCallback(async () => {
    const res = await getWorkflow(workflowId, workspaceId);
    if (res.success && res.data) {
      setWorkflow(res.data);
    } else {
      toast.error(res.message || 'Failed to load workflow');
    }
  }, [workflowId, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchWorkflow().finally(() => setLoading(false));
  }, [fetchWorkflow]);

  const handleRun = async () => {
    setRunning(true);
    const res = await runWorkflow(workflowId, workspaceId);
    if (res.success) {
      toast.success('Workflow started');
      fetchWorkflow();
    } else {
      toast.error(res.message);
    }
    setRunning(false);
  };

  const handleDelete = async () => {
    const res = await deleteWorkflow(workflowId, workspaceId);
    if (res.success) {
      toast.success('Workflow deleted');
      onBack?.();
    } else {
      toast.error(res.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">Workflow not found</p>
        {onBack && (
          <Button variant="outline" className="mt-4" onClick={onBack}>
            Go Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
              <ArrowUp className="h-4 w-4 rotate-[-90deg]" />
            </Button>
          )}
          <h2 className="text-xl font-semibold">Workflow Details</h2>
        </div>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Workflow
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full flex overflow-x-auto">
          <TabsTrigger value="overview" className="flex-1 min-w-0">Overview</TabsTrigger>
          <TabsTrigger value="triggers" className="flex-1 min-w-0">Triggers</TabsTrigger>
          <TabsTrigger value="actions" className="flex-1 min-w-0">Actions</TabsTrigger>
          <TabsTrigger value="variables" className="flex-1 min-w-0">Variables</TabsTrigger>
          <TabsTrigger value="history" className="flex-1 min-w-0">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab workflow={workflow} workspaceId={workspaceId} onRun={handleRun} running={running} />
        </TabsContent>
        <TabsContent value="triggers" className="mt-4">
          <TriggersTab workflow={workflow} workspaceId={workspaceId} onRefresh={fetchWorkflow} />
        </TabsContent>
        <TabsContent value="actions" className="mt-4">
          <ActionsTab workflow={workflow} workspaceId={workspaceId} onRefresh={fetchWorkflow} />
        </TabsContent>
        <TabsContent value="variables" className="mt-4">
          <VariablesTab workflow={workflow} workspaceId={workspaceId} onRefresh={fetchWorkflow} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab workflowId={workflowId} workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
