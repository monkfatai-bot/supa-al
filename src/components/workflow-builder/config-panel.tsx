'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Copy,
  Trash2,
  Bug,
  Settings2,
  Zap,
  Sparkles,
  GitBranch,
  Database,
  Bell,
  Briefcase,
  Plug,
  MousePointerClick,
  Clock,
  Globe,
  User,
  Users,
  MessageSquare,
  ImageIcon,
  Video,
  Mic,
  Languages,
  FileText,
  Tag,
  ScanText,
  GitMerge,
  GitFork,
  Split,
  Repeat,
  Timer,
  LayoutGrid,
  OctagonX,
  Variable,
  Braces,
  ArrowRightLeft,
  AlignLeft,
  Calculator,
  RefreshCw,
  Filter,
  MessageCircle,
  Send,
  Hash,
  AtSign,
  Smartphone,
  Contact,
  UserPlus,
  Receipt,
  FileCheck,
  CreditCard,
  Package,
  DollarSign,
  CheckSquare,
  Calendar,
  Brain,
  Bot,
  Cpu,
  Github,
  HardDrive,
  ShoppingBag,
  PanelRightClose,
  PanelRightOpen,
  Save,
  AlertTriangle,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import { nodeRegistry, type NodeFieldDefinition } from '@/services/workflow-builder';
import { cn } from '@/lib/utils';

// ─── Icon Map ───────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MousePointerClick, Clock, Globe, Zap, User, Users, Sparkles, Briefcase,
  MessageSquare, ImageIcon, Video, Mic, Languages, FileText, Tag, Database,
  ScanText, GitBranch, GitMerge, GitFork, Split, Repeat, Timer, LayoutGrid,
  OctagonX, Variable, Braces, ArrowRightLeft, AlignLeft, Calculator,
  RefreshCw, Filter, Bell, MessageCircle, Send, Hash, AtSign, Smartphone,
  Contact, UserPlus, Receipt, FileCheck, CreditCard, Package, DollarSign,
  CheckSquare, Calendar, Brain, Bot, Cpu, Github, HardDrive, ShoppingBag, Plug,
};

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Comp = ICON_MAP[name] ?? Variable;
  return <Comp className={className} />;
}

// ─── Constants ──────────────────────────────────────────────

const AI_MODELS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo',
  'claude-sonnet-4-20250514', 'claude-3.5-sonnet', 'claude-3-haiku',
  'gemini-2.5-pro', 'gemini-2.0-flash',
  'deepseek-chat', 'deepseek-reasoner',
];

const AI_PROVIDERS = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenRouter', value: 'openrouter' },
  { label: 'Grok', value: 'grok' },
  { label: 'Qwen', value: 'qwen' },
];

const CATEGORY_BADGE: Record<string, string> = {
  trigger: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  ai: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  logic: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  data: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  communication: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  business: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  integration: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

// ─── Field Renderer ──────────────────────────────────────────

function FieldRenderer({
  field,
  value,
  onChange,
  error,
}: {
  field: NodeFieldDefinition;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  error?: string;
}) {
  const id = `field-${field.key}`;
  const strValue = value === undefined || value === null ? '' : String(value);

  const baseClasses = 'w-full text-sm';

  const renderLabel = () => (
    <Label htmlFor={id} className="mb-1.5 text-xs font-medium">
      {field.label}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  );

  const renderDescription = () =>
    field.description ? (
      <p className="mt-1 text-[11px] text-muted-foreground">{field.description}</p>
    ) : null;

  const renderError = () =>
    error ? (
      <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
        <AlertTriangle className="h-3 w-3" />
        {error}
      </p>
    ) : null;

  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Input
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className={cn(baseClasses, error && 'border-destructive')}
          />
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'textarea':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Textarea
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className={cn(baseClasses, error && 'border-destructive')}
          />
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Input
            id={id}
            type="number"
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value === '' ? '' : Number(e.target.value))}
            min={field.placeholder ? Number(field.placeholder) : undefined}
            className={cn(baseClasses, error && 'border-destructive')}
          />
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Select
            value={strValue}
            onValueChange={(v) => onChange(field.key, v)}
          >
            <SelectTrigger className={cn(baseClasses, error && 'border-destructive')}>
              <SelectValue placeholder={field.placeholder ?? 'Select…'} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <div>
            {renderLabel()}
            {renderDescription()}
          </div>
          <Switch
            id={id}
            checked={Boolean(value)}
            onCheckedChange={(v) => onChange(field.key, v)}
          />
        </div>
      );

    case 'json':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Textarea
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder='{ "key": "value" }'
            rows={4}
            className={cn(
              'w-full font-mono text-xs',
              error && 'border-destructive',
            )}
          />
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'code':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Textarea
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className="w-full font-mono text-xs"
          />
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'model-select':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Select
            value={strValue}
            onValueChange={(v) => onChange(field.key, v)}
          >
            <SelectTrigger className={cn(baseClasses, error && 'border-destructive')}>
              <SelectValue placeholder="Select model…" />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'provider-select':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Select
            value={strValue}
            onValueChange={(v) => onChange(field.key, v)}
          >
            <SelectTrigger className={cn(baseClasses, error && 'border-destructive')}>
              <SelectValue placeholder="Select provider…" />
            </SelectTrigger>
            <SelectContent>
              {AI_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'variable-picker':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <div className="flex gap-1.5">
            <Input
              id={id}
              value={strValue}
              onChange={(e) => onChange(field.key, e.target.value)}
              placeholder={field.placeholder ?? 'Type or pick variable…'}
              className={cn('flex-1', baseClasses, error && 'border-destructive')}
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 px-2">
                  <Variable className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Available Variables</p>
                <div className="space-y-0.5">
                  {['trigger.input', 'steps.output', 'workflow.id'].map((v) => (
                    <button
                      key={v}
                      onClick={() => onChange(field.key, `{{${v}}}`)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                    >
                      <Braces className="h-3 w-3 text-muted-foreground" />
                      {v}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {renderDescription()}
          {renderError()}
        </div>
      );

    case 'cron':
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Input
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            placeholder="* * * * *"
            className={cn(baseClasses, error && 'border-destructive')}
          />
          <p className="text-[11px] text-muted-foreground">
            Cron format: min hour day month weekday (e.g. <code className="rounded bg-muted px-1">0 9 * * 1-5</code>)
          </p>
          {renderError()}
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          {renderLabel()}
          <Input
            id={id}
            value={strValue}
            onChange={(e) => onChange(field.key, e.target.value)}
            className={cn(baseClasses, error && 'border-destructive')}
          />
          {renderDescription()}
          {renderError()}
        </div>
      );
  }
}

// ─── Main Component ──────────────────────────────────────────

export function ConfigPanel() {
  const {
    selectedNodeIds,
    nodes,
    updateNode,
    removeNodes,
    debug,
    addBreakpoint,
    removeBreakpoint,
    panels,
    togglePanel,
    triggerAutoSave,
    clearSelection,
  } = useWorkflowBuilderStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeIds[0]),
    [nodes, selectedNodeIds],
  );

  const nodeData = selectedNode?.data as Record<string, unknown> | undefined;
  const nodeType = nodeData?.nodeType as string | undefined;
  const definition = useMemo(
    () => (nodeType ? nodeRegistry.getByType(nodeType) : undefined),
    [nodeType],
  );

  const config = useMemo(() => (nodeData?.config as Record<string, unknown>) ?? {}, [nodeData]);

  const debugEntry = useMemo(() => {
    if (!selectedNode) return null;
    return debug.executionTimeline.find((e) => e.nodeId === selectedNode.id) ?? null;
  }, [debug.executionTimeline, selectedNode]);

  const hasBreakpoint = debug.breakpointNodeIds.includes(selectedNodeIds[0] ?? '');

  const handleFieldChange = useCallback(
    (key: string, value: unknown) => {
      if (!selectedNode) return;
      const fieldDef = definition?.fields.find((f) => f.key === key);
      if (fieldDef?.validation) {
        const err = fieldDef.validation(value);
        setValidationErrors((prev) => ({ ...prev, [key]: err ?? '' }));
      }
      updateNode(selectedNode.id, {
        data: { ...selectedNode.data, config: { ...config, [key]: value } },
      } as Partial<Node>);
      triggerAutoSave(async () => {});
    },
    [selectedNode, definition, config, updateNode, triggerAutoSave],
  );

  const handleDelete = useCallback(() => {
    if (selectedNodeIds.length > 0) {
      removeNodes(selectedNodeIds);
      clearSelection();
    }
    setDeleteDialogOpen(false);
  }, [selectedNodeIds, removeNodes, clearSelection]);

  const handleToggleBreakpoint = useCallback(() => {
    if (!selectedNode) return;
    if (hasBreakpoint) {
      removeBreakpoint(selectedNode.id);
    } else {
      addBreakpoint(selectedNode.id);
    }
  }, [selectedNode, hasBreakpoint, addBreakpoint, removeBreakpoint]);

  const handleCopyId = useCallback(() => {
    if (selectedNode) {
      navigator.clipboard.writeText(selectedNode.id);
    }
  }, [selectedNode]);

  const fieldsByGroup = useMemo(() => {
    if (!definition) return new Map<string, NodeFieldDefinition[]>();
    const map = new Map<string, NodeFieldDefinition[]>();
    for (const f of definition.fields) {
      const group = f.group ?? 'General';
      const list = map.get(group) ?? [];
      list.push(f);
      map.set(group, list);
    }
    return map;
  }, [definition]);

  const groups = useMemo(() => [...fieldsByGroup.keys()], [fieldsByGroup]);

  // ─── Empty state ─────────────────────────────────────
  if (!selectedNode || !definition) {
    return (
      <>
        <AnimatePresence initial={false}>
          {panels.right && (
            <motion.aside
              key="config-panel-empty"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="flex flex-col border-l bg-background overflow-hidden"
              role="complementary"
              aria-label="Node configuration"
            >
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <h2 className="text-sm font-semibold">Configure</h2>
                <button
                  onClick={() => togglePanel('right')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  aria-label="Close panel"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Settings2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Select a node to configure</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Click on any node in the canvas to view and edit its settings
                  </p>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
        {!panels.right && (
          <button
            onClick={() => togglePanel('right')}
            className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label="Open configuration panel"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            Configure
          </button>
        )}
      </>
    );
  }

  // ─── Populated state ─────────────────────────────────
  return (
    <>
      <AnimatePresence initial={false}>
        {panels.right && (
          <motion.aside
            key="config-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex flex-col border-l bg-background overflow-hidden"
            role="complementary"
            aria-label="Node configuration"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-4 py-2.5">
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', CATEGORY_BADGE[definition.category] ?? CATEGORY_BADGE.integration)}>
                <DynamicIcon name={definition.icon} className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{nodeData?.label as string ?? definition.label}</p>
                <Badge variant="secondary" className="mt-0.5 text-[10px]">
                  {definition.category}
                </Badge>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { clearSelection(); togglePanel('right'); }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      aria-label="Close configuration"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Close</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="settings" className="flex flex-1 flex-col overflow-hidden">
              <TabsList className="mx-3 mt-2 grid w-auto grid-cols-3">
                <TabsTrigger value="settings" className="text-xs">
                  <Settings2 className="mr-1 h-3 w-3" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="advanced" className="text-xs">
                  <Zap className="mr-1 h-3 w-3" />
                  Advanced
                </TabsTrigger>
                <TabsTrigger value="debug" className="text-xs">
                  <Bug className="mr-1 h-3 w-3" />
                  Debug
                </TabsTrigger>
              </TabsList>

              {/* Settings Tab */}
              <TabsContent value="settings" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full px-4 py-3">
                  <div className="space-y-5">
                    {groups.map((group, gi) => (
                      <div key={group}>
                        {gi > 0 && <Separator className="mb-4" />}
                        {group !== 'General' && (
                          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {group}
                          </h3>
                        )}
                        <div className="space-y-4">
                          {fieldsByGroup.get(group)?.map((field) => (
                            <FieldRenderer
                              key={field.key}
                              field={field}
                              value={config[field.key] ?? field.defaultValue}
                              onChange={handleFieldChange}
                              error={validationErrors[field.key] || undefined}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full px-4 py-3">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Retry Limit</Label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={(config.retry_limit as number) ?? 0}
                        onChange={(e) => handleFieldChange('retry_limit', Number(e.target.value))}
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">0–10 retries on failure</p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Timeout (seconds)</Label>
                      <Input
                        type="number"
                        min={5}
                        max={300}
                        value={((config.timeout_ms as number) ?? 30) / 1000}
                        onChange={(e) => handleFieldChange('timeout_ms', Number(e.target.value) * 1000)}
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">5–300 seconds</p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">On Failure</Label>
                      <Select
                        value={(config.on_failure as string) ?? 'stop'}
                        onValueChange={(v) => handleFieldChange('on_failure', v)}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stop">Stop</SelectItem>
                          <SelectItem value="continue">Continue</SelectItem>
                          <SelectItem value="retry">Retry</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Step Position</Label>
                      <Input
                        value={String((config.step_position as number) ?? 0)}
                        readOnly
                        className="text-sm bg-muted"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Node ID</Label>
                      <div className="flex gap-1.5">
                        <Input
                          value={selectedNode.id}
                          readOnly
                          className="flex-1 text-xs font-mono bg-muted"
                        />
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCopyId}
                                className="shrink-0 px-2"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy ID</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Enabled</Label>
                        <p className="text-[11px] text-muted-foreground">Disable to skip this step</p>
                      </div>
                      <Switch
                        checked={Boolean(nodeData?.isEnabled ?? true)}
                        onCheckedChange={(v) =>
                          updateNode(selectedNode.id, {
                            data: { ...selectedNode.data, isEnabled: v },
                          } as Partial<Node>)
                        }
                      />
                    </div>

                    <Separator />

                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                      Delete Node
                    </Button>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Debug Tab */}
              <TabsContent value="debug" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-full px-4 py-3">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Breakpoint</Label>
                        <p className="text-[11px] text-muted-foreground">Pause execution at this node</p>
                      </div>
                      <Switch
                        checked={hasBreakpoint}
                        onCheckedChange={handleToggleBreakpoint}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Last Output</Label>
                      <Textarea
                        readOnly
                        value={
                          debugEntry?.output
                            ? JSON.stringify(debugEntry.output, null, 2)
                            : 'No output yet'
                        }
                        rows={6}
                        className="w-full font-mono text-xs bg-muted resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Last Error</Label>
                      <Textarea
                        readOnly
                        value={debugEntry?.error ?? 'No errors'}
                        rows={3}
                        className={cn(
                          'w-full font-mono text-xs resize-none',
                          debugEntry?.error ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-muted',
                        )}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Execution Duration</Label>
                      <p className="text-sm text-muted-foreground">
                        {debugEntry?.durationMs != null
                          ? `${(debugEntry.durationMs / 1000).toFixed(2)}s`
                          : 'Not executed'}
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Save button */}
            <div className="border-t px-4 py-2.5">
              <Button size="sm" className="w-full" onClick={() => triggerAutoSave(async () => {})}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                Save Changes
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &quot;{nodeData?.label as string ?? definition.label}&quot;? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Collapsed toggle */}
      {!panels.right && selectedNode && (
        <button
          onClick={() => togglePanel('right')}
          className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Open configuration panel"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
          Configure
        </button>
      )}
    </>
  );
}
