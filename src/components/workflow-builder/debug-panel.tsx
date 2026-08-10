'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  SkipForward,
  ArrowDown,
  Square,
  Bug,
  X,
  Copy,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  Wrench,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import type { DebugTimelineEntry } from '@/services/workflow-builder';
import { cn } from '@/lib/utils';
import { debugExecuteStep } from '@/services/automation/actions';

// ─── Status Configs ───────────────────────────────────────

const STEP_STATUS_CONFIG: Record<
  DebugTimelineEntry['status'],
  { icon: React.ReactNode; badgeCls: string; label: string }
> = {
  pending: {
    icon: <Circle className="h-3 w-3" />,
    badgeCls: 'border-border text-muted-foreground',
    label: 'Pending',
  },
  running: {
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    badgeCls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    label: 'Running',
  },
  completed: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    badgeCls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    label: 'Done',
  },
  failed: {
    icon: <AlertCircle className="h-3 w-3" />,
    badgeCls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    label: 'Failed',
  },
  skipped: {
    icon: <Circle className="h-3 w-3" />,
    badgeCls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    label: 'Skipped',
  },
};

const LOG_LEVEL_CONFIG: Record<
  string,
  { badgeCls: string; label: string }
> = {
  info: { badgeCls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', label: 'Info' },
  warn: { badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', label: 'Warn' },
  error: { badgeCls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'Error' },
};

// ─── Mock Log Entry ───────────────────────────────────────

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: unknown;
}

// ─── DebugPanel Component ─────────────────────────────────

export function DebugPanel() {
  const debug = useWorkflowBuilderStore((s) => s.debug);
  const validationErrors = useWorkflowBuilderStore((s) => s.validationErrors);
  const nodes = useWorkflowBuilderStore((s) => s.nodes);
  const panels = useWorkflowBuilderStore((s) => s.panels);
  const selectNode = useWorkflowBuilderStore((s) => s.selectNode);
  const setValidationErrors = useWorkflowBuilderStore((s) => s.setValidationErrors);
  const setDebugState = useWorkflowBuilderStore((s) => s.setDebugState);
  const togglePanel = useWorkflowBuilderStore((s) => s.togglePanel);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [varSearch, setVarSearch] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // ─── Log Helpers ───────────────────────────────────────
  const addLog = useCallback((level: LogEntry['level'], message: string, details?: unknown) => {
    setLogs((prev) => {
      const next = [...prev, { id: crypto.randomUUID(), timestamp: Date.now(), level, message, details }];
      return next.slice(-500);
    });
  }, []);

  // ─── Debug Controls ────────────────────────────────────
  const handleStartDebug = useCallback(() => {
    const timeline: DebugTimelineEntry[] = nodes.map((n, i) => ({
      nodeId: n.id,
      nodeLabel: (n.data as Record<string, unknown>)?.label as string ?? n.id,
      status: i === 0 ? 'running' : 'pending',
      startedAt: i === 0 ? Date.now() : 0,
    }));
    setDebugState({
      isDebugging: true,
      isPaused: false,
      currentStepIndex: 0,
      executionTimeline: timeline,
      variableSnapshot: { workflowName: useWorkflowBuilderStore.getState().workflowName },
    });
    addLog('info', `Debug session started with ${nodes.length} node(s).`);
    toast.success('Debug started', { description: 'Step through your workflow.' });
  }, [nodes, setDebugState, addLog]);

  const handleStop = useCallback(() => {
    setDebugState({ isDebugging: false, isPaused: false, currentStepIndex: -1, executionTimeline: [], variableSnapshot: {} });
    addLog('info', 'Debug session stopped.');
    toast.info('Debug stopped');
  }, [setDebugState, addLog]);

  const handleStepOver = useCallback(async () => {
    const { debug: d, workflowId, nodes } = useWorkflowBuilderStore.getState();
    const next = d.currentStepIndex + 1;
    if (next >= d.executionTimeline.length) {
      setDebugState({ isPaused: true, currentStepIndex: d.executionTimeline.length - 1 });
      addLog('info', 'Execution completed.');
      return;
    }

    // Mark current as completed and next as running immediately
    const updated = d.executionTimeline.map((e, i) => {
      if (i === d.currentStepIndex) return { ...e, status: 'completed' as const, completedAt: Date.now(), durationMs: 0 };
      if (i === next) return { ...e, status: 'running' as const, startedAt: Date.now() };
      return e;
    });
    setDebugState({ currentStepIndex: next, executionTimeline: updated });

    // Execute the step via server action
    if (workflowId) {
      try {
        const currentNode = nodes[d.currentStepIndex];
        const nodeData = currentNode?.data as Record<string, unknown> | undefined;
        const actionType = nodeData?.nodeType as string | undefined;
        const result = await debugExecuteStep(workflowId, d.currentStepIndex, {});

        // Update the completed step with real duration and result/error
        const updatedTimeline = [...d.executionTimeline];
        if (updatedTimeline[d.currentStepIndex]) {
          updatedTimeline[d.currentStepIndex] = {
            ...updatedTimeline[d.currentStepIndex],
            durationMs: result.duration_ms ?? 0,
            status: result.error ? 'failed' as const : 'completed' as const,
            output: result.error ? undefined : result.output,
            error: result.error ?? undefined,
          };
        }
        setDebugState({ executionTimeline: updatedTimeline });

        if (result.error) {
          addLog('error', `Step "${actionType ?? 'unknown'}" failed: ${result.error}`, result);
        } else if (result.output) {
          addLog('info', `Step "${actionType ?? 'unknown'}" completed`, result.output);
        } else {
          addLog('info', `Step "${actionType ?? 'unknown'}" completed (no output)`);
        }
      } catch (err) {
        addLog('error', `Debug step error: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    } else {
      addLog('warn', 'No workflow ID — using mock execution.');
    }
  }, [setDebugState, addLog]);

  const handleStepInto = useCallback(async () => {
    await handleStepOver();
  }, [handleStepOver]);

  const handleContinue = useCallback(() => {
    setDebugState({ isPaused: false });
    toast.info('Continuing execution...');
  }, [setDebugState]);

  const handlePause = useCallback(() => {
    setDebugState({ isPaused: true });
    addLog('warn', 'Execution paused by user.');
  }, [setDebugState, addLog]);

  // ─── Fix All Errors ────────────────────────────────────
  const handleFixAll = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    const orphanErrors = state.validationErrors.filter(
      (e) => e.type === 'missing_connection' && e.nodeId,
    );
    if (orphanErrors.length === 0) {
      toast.info('No auto-fixable errors found.');
      return;
    }
    // Remove orphan errors as a simplified fix
    const remaining = state.validationErrors.filter(
      (e) => e.type !== 'missing_connection',
    );
    setValidationErrors(remaining);
    toast.success(`Attempted to fix ${orphanErrors.length} error(s).`);
  }, [setValidationErrors]);

  const toggleLogExpand = useCallback((id: string) => {
    setExpandedLogs((prev) => {
      const has = prev.has(id);
      return has
        ? new Set([...prev].filter((v) => v !== id))
        : new Set([...prev, id]);
    });
  }, []);

  // ─── Variables derived state ──────────────────────────
  const variables = debug.variableSnapshot;
  const varEntries = Object.entries(variables).filter(([name]) =>
    !varSearch || name.toLowerCase().includes(varSearch.toLowerCase()),
  );

  const getVarType = (val: unknown): string => {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  };

  const getVarScope = (_name: string): string => {
    return 'global';
  };

  // ─── Filtered logs ────────────────────────────────────
  const filteredLogs = logFilter === 'all' ? logs : logs.filter((l) => l.level === logFilter);

  // ─── Total duration ───────────────────────────────────
  const totalDuration = debug.executionTimeline.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

  // ─── Render: Collapsed Tab ────────────────────────────
  if (!panels.bottom) {
    return (
      <button
        onClick={() => togglePanel('bottom')}
        className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-sm hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label="Open debug panel"
      >
        <Bug className="h-3.5 w-3.5" />
        Debug
        {validationErrors.length > 0 && (
          <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
            {validationErrors.length}
          </Badge>
        )}
      </button>
    );
  }

  // ─── Render: Expanded Panel ───────────────────────────
  return (
    <TooltipProvider>
      <div className="flex h-60 flex-col border-t bg-background/95 backdrop-blur-sm">
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex h-9 items-center justify-between border-b px-3">
          <div className="flex items-center gap-2">
            <Bug className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Debug</span>
          </div>
          <div className="flex items-center gap-1">
            {!debug.isDebugging ? (
              <Button size="sm" variant="default" className="h-6 gap-1 px-2 text-[11px]" onClick={handleStartDebug}>
                <Play className="h-3 w-3" />
                Start Debug
              </Button>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleStepOver}>
                      <SkipForward className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Step Over</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleStepInto}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Step Into</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleContinue}>
                      <Play className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Continue</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handlePause}>
                      <Pause className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Pause</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={handleStop}>
                      <Square className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Stop</TooltipContent>
                </Tooltip>
              </>
            )}
            <Button variant="ghost" size="icon" className="ml-1 h-6 w-6" onClick={() => togglePanel('bottom')}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* ── Tabs Content ─────────────────────────────── */}
        <Tabs defaultValue="timeline" className="flex flex-1 min-h-0">
          <div className="flex items-center border-b px-3">
            <TabsList className="h-7">
              <TabsTrigger value="timeline" className="h-6 px-2 text-[11px]">
                Timeline
              </TabsTrigger>
              <TabsTrigger value="variables" className="h-6 px-2 text-[11px]">
                Variables
              </TabsTrigger>
              <TabsTrigger value="logs" className="h-6 px-2 text-[11px]">
                Logs
              </TabsTrigger>
              <TabsTrigger value="errors" className="h-6 px-2 text-[11px]">
                Errors
                {validationErrors.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-3.5 min-w-3.5 px-1 text-[9px]">
                    {validationErrors.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Timeline Tab ──────────────────────────── */}
          <TabsContent value="timeline" className="mt-0">
            <ScrollArea className="h-[calc(15rem-5.5rem)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <AnimatePresence mode="popLayout">
                  {debug.executionTimeline.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
                      Start a debug session to see the timeline.
                    </div>
                  ) : (
                    debug.executionTimeline.map((entry, idx) => {
                      const cfg = STEP_STATUS_CONFIG[entry.status];
                      const isCurrent = idx === debug.currentStepIndex;
                      return (
                        <motion.div
                          key={entry.nodeId}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => selectNode(entry.nodeId)}
                          className={cn(
                            'flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 min-w-[80px] transition-shadow',
                            isCurrent && 'ring-2 ring-primary shadow-md',
                          )}
                        >
                          <div className={cn('flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', cfg.badgeCls)}>
                            {cfg.icon}
                            {cfg.label}
                          </div>
                          <span className="max-w-[70px] truncate text-[10px] text-center text-muted-foreground">
                            {entry.nodeLabel}
                          </span>
                          {entry.durationMs != null && (
                            <span className="text-[9px] tabular-nums text-muted-foreground/70">
                              {entry.durationMs.toFixed(0)}ms
                            </span>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
                {debug.executionTimeline.length > 0 && (
                  <div className="flex flex-col items-center gap-1 text-[10px] text-muted-foreground ml-2">
                    <Clock className="h-3 w-3" />
                    <span className="tabular-nums">{totalDuration.toFixed(0)}ms</span>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Variables Tab ─────────────────────────── */}
          <TabsContent value="variables" className="mt-0">
            <div className="flex items-center gap-2 border-b px-3 py-1.5">
              <Search className="h-3 w-3 text-muted-foreground" />
              <Input
                value={varSearch}
                onChange={(e) => setVarSearch(e.target.value)}
                placeholder="Filter variables..."
                className="h-6 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0 px-0"
              />
            </div>
            <ScrollArea className="h-[calc(15rem-5.5rem-2rem)]">
              {varEntries.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  {Object.keys(variables).length === 0 ? 'No variables yet.' : 'No matching variables.'}
                </div>
              ) : (
                <div className="divide-y">
                  {varEntries.map(([name, value]) => (
                    <div
                      key={name}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 transition-colors group"
                    >
                      <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal shrink-0">
                        {getVarScope(name)}
                      </Badge>
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal shrink-0">
                        {getVarType(value)}
                      </Badge>
                      <span className="flex-1 truncate text-xs font-mono">{name}</span>
                      <span className="max-w-[120px] truncate text-xs text-muted-foreground font-mono">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(String(value));
                          toast.success('Copied to clipboard');
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Copy value"
                      >
                        <Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Logs Tab ───────────────────────────────── */}
          <TabsContent value="logs" className="mt-0">
            <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
              {(['all', 'info', 'warn', 'error'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setLogFilter(lvl)}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                    logFilter === lvl ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {lvl === 'all' ? 'All' : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setLogs([])}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear logs"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <ScrollArea className="h-[calc(15rem-5.5rem-2rem)]">
              {filteredLogs.length === 0 ? (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                  No log entries yet.
                </div>
              ) : (
                <div className="divide-y">
                  {[...filteredLogs].reverse().map((log) => {
                    const cfg = LOG_LEVEL_CONFIG[log.level] ?? LOG_LEVEL_CONFIG.info;
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                      <div key={log.id} className="px-3 py-1.5 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Badge className={cn('h-4 px-1 text-[9px] shrink-0 border-0', cfg.badgeCls)}>
                            {cfg.label}
                          </Badge>
                          <span className="flex-1 text-xs">{log.message}</span>
                          <span className="text-[9px] tabular-nums text-muted-foreground shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          {log.details != null ? (
                            <button onClick={() => toggleLogExpand(log.id)} className="shrink-0">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </button>
                          ) : null}
                        </div>
                        <AnimatePresence>
                          {isExpanded && log.details != null ? (
                            <motion.pre
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono text-muted-foreground"
                            >
                              {JSON.stringify(log.details, null, 2)}
                            </motion.pre>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={logsEndRef} />
            </ScrollArea>
          </TabsContent>

          {/* ── Errors Tab ──────────────────────────────── */}
          <TabsContent value="errors" className="mt-0">
            <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground">
                {validationErrors.length} issue(s)
              </span>
              <div className="flex-1" />
              {validationErrors.some((e) => e.type === 'missing_connection') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={handleFixAll}
                >
                  <Wrench className="h-3 w-3" />
                  Fix all
                </Button>
              )}
              <button
                onClick={() => setValidationErrors([])}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Clear errors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <ScrollArea className="h-[calc(15rem-5.5rem-2rem)]">
              {validationErrors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">No errors found.</span>
                </div>
              ) : (
                <div className="divide-y">
                  {validationErrors.map((err, idx) => (
                    <div key={`${err.type}-${err.nodeId ?? idx}`} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/50 transition-colors">
                      {err.severity === 'error' ? (
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">{err.message}</p>
                        {err.nodeId && (
                          <button
                            onClick={() => {
                              selectNode(err.nodeId!);
                              togglePanel('bottom');
                            }}
                            className="mt-0.5 text-[10px] text-primary hover:underline"
                          >
                            Go to node →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
