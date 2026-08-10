'use client';

import { useCallback, useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Map,
  Grid3x3,
  Bug,
  CheckCircle,
  Play,
  Save,
  MoreVertical,
  PanelLeft,
  PanelRight,
  PanelBottom,
  Download,
  Upload,
  Trash2,
  Keyboard,
  Send,
  Loader2,
  History,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import { validateWorkflow } from '@/services/workflow-builder';
import { saveWorkflowCanvas, publishWorkflowVersion } from '@/services/workflow-builder/actions';
import { workflowCanvasInstance } from './workflow-canvas';
import { VersionHistoryPanel } from './version-history-panel';
import { ExecutionPreviewPanel } from './execution-preview';
import type { InsertTables, Json } from '@/types/generated/database';

// ─── Status badge config ───────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: {
    label: 'Draft',
    className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  paused: {
    label: 'Paused',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

// ─── BuilderToolbar Component ─────────────────────────────────────
export function BuilderToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [execPreviewOpen, setExecPreviewOpen] = useState(false);

  // Store selectors
  const workflowName = useWorkflowBuilderStore((s) => s.workflowName);
  const isDirty = useWorkflowBuilderStore((s) => s.isDirty);
  const isSaving = useWorkflowBuilderStore((s) => s.isSaving);
  const canUndo = useWorkflowBuilderStore((s) => s.canUndo);
  const canRedo = useWorkflowBuilderStore((s) => s.canRedo);
  const panels = useWorkflowBuilderStore((s) => s.panels);
  const debug = useWorkflowBuilderStore((s) => s.debug);
  const viewport = useWorkflowBuilderStore((s) => s.viewport);
  const validationErrors = useWorkflowBuilderStore((s) => s.validationErrors);
  const nodes = useWorkflowBuilderStore((s) => s.nodes);
  const edges = useWorkflowBuilderStore((s) => s.edges);
  const togglePanel = useWorkflowBuilderStore((s) => s.togglePanel);
  const setDebugState = useWorkflowBuilderStore((s) => s.setDebugState);
  const undo = useWorkflowBuilderStore((s) => s.undo);
  const redo = useWorkflowBuilderStore((s) => s.redo);

  // ─── Workflow name edit ───────────────────────────────────────
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      useWorkflowBuilderStore.setState({ workflowName: e.target.value, isDirty: true });
    },
    [],
  );

  // ─── Zoom controls (use ReactFlow instance) ──────────────────
  const handleZoomIn = useCallback(() => {
    workflowCanvasInstance.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    workflowCanvasInstance.current?.zoomOut();
  }, []);

  const handleFitView = useCallback(() => {
    workflowCanvasInstance.current?.fitView({ padding: 0.2, duration: 300 });
  }, []);

  // ─── Validate ──────────────────────────────────────────────────
  const handleValidate = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    const errors = validateWorkflow(state.nodes, state.edges);
    state.setValidationErrors(errors);
    const errorCount = errors.filter((e) => e.severity === 'error').length;
    const warningCount = errors.filter((e) => e.severity === 'warning').length;
    if (errorCount === 0 && warningCount === 0) {
      toast.success('Workflow is valid', { description: 'No issues found.' });
    } else if (errorCount === 0) {
      toast.warning('Workflow has warnings', {
        description: `${warningCount} warning(s) found. The workflow can still run.`,
      });
    } else {
      toast.error('Workflow has errors', {
        description: `${errorCount} error(s) and ${warningCount} warning(s) found.`,
      });
    }
  }, []);

  // ─── Run workflow (with confirmation) ──────────────────────────
  const handleRun = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    const errors = validateWorkflow(state.nodes, state.edges);
    const critical = errors.filter((e) => e.severity === 'error');
    if (critical.length > 0) {
      toast.error('Cannot run workflow', {
        description: `Fix ${critical.length} error(s) before running.`,
      });
      return;
    }
    setRunDialogOpen(true);
  }, []);

  const confirmRun = useCallback(() => {
    setRunDialogOpen(false);
    toast.success('Workflow started', {
      description: 'The workflow is now running.',
    });
  }, []);

  // ─── Save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    const state = useWorkflowBuilderStore.getState();
    if (!state.workflowId || !state.isDirty) return;
    state.setSaving(true);
    try {
      const now = () => new Date().toISOString();
      const dbNodes: InsertTables<'workflow_nodes'>[] = state.nodes.map((n) => ({
        id: n.id,
        workflow_id: state.workflowId!,
        node_key: n.id,
        node_type: (n.data as Record<string, unknown>)?.nodeType as string,
        node_category: (n.data as Record<string, unknown>)?.nodeCategory as 'trigger' | 'ai' | 'logic' | 'data' | 'communication' | 'business' | 'integration',
        label: (n.data as Record<string, unknown>)?.label as string,
        description: (n.data as Record<string, unknown>)?.description as string,
        position_x: Math.round(n.position.x),
        position_y: Math.round(n.position.y),
        config: ((n.data as Record<string, unknown>)?.config ?? {}) as Json,
        data: n.data as unknown as Json,
        is_enabled: (n.data as Record<string, unknown>)?.isEnabled !== false,
        has_breakpoint: (n.data as Record<string, unknown>)?.hasBreakpoint === true,
        created_at: now(),
        updated_at: now(),
      }));
      const dbEdges: InsertTables<'workflow_edges'>[] = state.edges.map((e) => ({
        id: e.id,
        workflow_id: state.workflowId!,
        edge_key: e.id,
        source_node_id: e.source,
        target_node_id: e.target,
        source_handle: e.sourceHandle ?? undefined,
        target_handle: e.targetHandle ?? undefined,
        created_at: now(),
        updated_at: now(),
      }));
      await saveWorkflowCanvas(state.workflowId, dbNodes, dbEdges, state.viewport, state.viewport.zoom);
      state.setDirty(false);
      toast.success('Workflow saved', { description: 'All changes have been saved.' });
    } catch {
      toast.error('Save failed', { description: 'Could not save the workflow. Try again.' });
    } finally {
      state.setSaving(false);
    }
  }, []);

  // ─── Export as JSON ────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    const payload = {
      name: state.workflowName,
      nodes: state.nodes,
      edges: state.edges,
      viewport: state.viewport,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.workflowName || 'workflow'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported', { description: 'Workflow exported as JSON.' });
  }, []);

  // ─── Import from JSON ─────────────────────────────────────────
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes && Array.isArray(data.nodes)) {
          useWorkflowBuilderStore.getState().setNodes(data.nodes);
        }
        if (data.edges && Array.isArray(data.edges)) {
          useWorkflowBuilderStore.getState().setEdges(data.edges);
        }
        if (data.name) {
          useWorkflowBuilderStore.setState({ workflowName: data.name });
        }
        useWorkflowBuilderStore.getState().pushHistory('Imported from JSON');
        toast.success('Imported', { description: 'Workflow imported from JSON.' });
      } catch {
        toast.error('Import failed', { description: 'Invalid JSON file.' });
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    e.target.value = '';
  }, []);

  // ─── Clear canvas ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    useWorkflowBuilderStore.getState().reset();
    toast.info('Canvas cleared', { description: 'All nodes and edges removed.' });
  }, []);

  // ─── Keyboard shortcuts reference ──────────────────────────────
  const handleShortcuts = useCallback(() => {
    toast.info('Keyboard Shortcuts', {
      description:
        'Ctrl+Z Undo · Ctrl+Shift+Z Redo · Ctrl+S Save · Ctrl+D Duplicate · Delete Remove · Ctrl+A Select All · Ctrl+/- Zoom · Ctrl+0 Fit View',
      duration: 8000,
    });
  }, []);

  // ─── Publish ──────────────────────────────────────────────────
  const [isPublishing, setIsPublishing] = useState(false);
  const workflowId = useWorkflowBuilderStore((s) => s.workflowId);

  const handlePublish = useCallback(async () => {
    if (!workflowId) {
      toast.error('Cannot publish', { description: 'Workflow ID is missing.' });
      return;
    }
    setIsPublishing(true);
    try {
      const result = await publishWorkflowVersion(workflowId);
      if (result.success) {
        toast.success('Workflow published', { description: 'A new version has been created.' });
      } else {
        toast.error('Publish failed', { description: result.error });
      }
    } catch {
      toast.error('Publish failed', { description: 'An unexpected error occurred.' });
    } finally {
      setIsPublishing(false);
    }
  }, [workflowId]);

  // ─── Status derivation ─────────────────────────────────────────
  const statusKey = 'draft';
  const statusConfig = STATUS_CONFIG[statusKey];

  return (
    <header
      className="flex h-12 items-center border-b bg-background/95 backdrop-blur px-4 gap-1"
      role="toolbar"
      aria-label="Workflow builder toolbar"
    >
      {/* ── Left: Workflow name + status ─────────────────────── */}
      <div className="flex items-center gap-2 min-w-0">
        <Input
          value={workflowName}
          onChange={handleNameChange}
          placeholder="Untitled Workflow"
          className="h-8 w-40 border-0 bg-transparent text-sm font-medium hover:bg-muted/50 focus:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-0 px-1"
          aria-label="Workflow name"
        />
        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-5 shrink-0 ${statusConfig.className}`}>
          {statusConfig.label}
        </Badge>
      </div>

      <Separator orientation="vertical" className="mx-2 h-6" />

      {/* ── Middle: Undo / Redo ──────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <ToolbarButton icon={<Redo2 className="h-3.5 w-3.5" />} label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* ── Middle: Zoom ────────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<ZoomOut className="h-3.5 w-3.5" />} label="Zoom Out" onClick={handleZoomOut} />
        <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <ToolbarButton icon={<ZoomIn className="h-3.5 w-3.5" />} label="Zoom In" onClick={handleZoomIn} />
        <ToolbarButton icon={<Maximize className="h-3.5 w-3.5" />} label="Fit View" onClick={handleFitView} />
      </div>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* ── Middle: Toggles ─────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          icon={<Map className="h-3.5 w-3.5" />}
          label="Toggle Minimap"
          onClick={() => togglePanel('minimap')}
          active={panels.minimap}
        />
        <ToolbarButton
          icon={<Grid3x3 className="h-3.5 w-3.5" />}
          label="Toggle Grid Snap"
          onClick={() => {
            /* grid snap is a ReactFlow prop; visual toggle only */
          }}
          active={true}
        />
        <ToolbarButton
          icon={<Bug className="h-3.5 w-3.5" />}
          label="Toggle Debug Mode"
          onClick={() => setDebugState({ isDebugging: !debug.isDebugging })}
          active={debug.isDebugging}
        />
      </div>

      {/* ── Middle: History + Preview ────────────────────── */}
      <Separator orientation="vertical" className="mx-1 h-6" />
      <div className="flex items-center gap-0.5">
        <ToolbarButton
          icon={<History className="h-3.5 w-3.5" />}
          label="Version History"
          onClick={() => setHistoryOpen(true)}
          active={historyOpen}
        />
        <ToolbarButton
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Execution Preview"
          onClick={() => setExecPreviewOpen(true)}
          active={execPreviewOpen}
        />
      </div>

      {/* ── Spacer ──────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Right: Actions ──────────────────────────────────── */}
      <div className="flex items-center gap-0.5">
        {/* Validate */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8" onClick={handleValidate}>
              <CheckCircle className="h-3.5 w-3.5" />
              {validationErrors.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                  {validationErrors.length}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Validate Workflow</TooltipContent>
        </Tooltip>

        {/* Run */}
        <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="default" size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleRun}>
                <Play className="h-3.5 w-3.5" />
                <span className="text-xs">Run</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run Workflow</TooltipContent>
          </Tooltip>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Run Workflow</DialogTitle>
              <DialogDescription>
                This will start executing the workflow &quot;{workflowName}&quot; with {nodes.length} node(s) and {edges.length} connection(s).
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRunDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700" onClick={confirmRun}>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Start
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Save */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="relative h-8 gap-1.5"
              onClick={handleSave}
              disabled={!isDirty}
            >
              {isSaving ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">Save</span>
              {isDirty && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-label="Unsaved changes" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDirty ? 'Save Workflow (Ctrl+S)' : 'No unsaved changes'}
          </TooltipContent>
        </Tooltip>

        {/* Publish */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">Publish</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Publish Version</TooltipContent>
        </Tooltip>

        {/* More options */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>More Options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>View</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => togglePanel('left')}>
              <PanelLeft className="h-4 w-4" />
              {panels.left ? 'Hide' : 'Show'} Left Panel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => togglePanel('right')}>
              <PanelRight className="h-4 w-4" />
              {panels.right ? 'Hide' : 'Show'} Right Panel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => togglePanel('bottom')}>
              <PanelBottom className="h-4 w-4" />
              {panels.bottom ? 'Hide' : 'Show'} Bottom Panel
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Data</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export as JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleImport}>
              <Upload className="h-4 w-4" />
              Import from JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClear} className="text-destructive">
              <Trash2 className="h-4 w-4" />
              Clear Canvas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleShortcuts}>
              <Keyboard className="h-4 w-4" />
              Keyboard Shortcuts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Version History Slide-out ─────────────────────── */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          {workflowId && (
            <VersionHistoryPanel
              workflowId={workflowId}
              onClose={() => setHistoryOpen(false)}
              onRestore={() => setHistoryOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Execution Preview Dialog ───────────────────────── */}
      <Dialog open={execPreviewOpen} onOpenChange={setExecPreviewOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[85vh]">
          <ExecutionPreviewPanel
            nodes={nodes}
            edges={edges}
            onExecute={() => {
              setExecPreviewOpen(false);
              handleRun();
            }}
          />
        </DialogContent>
      </Dialog>
    </header>
  );
}

// ─── ToolbarButton (reusable ghost icon button) ────────────────────
interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

function ToolbarButton({ icon, label, onClick, disabled, active }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 ${active ? 'bg-accent text-accent-foreground' : ''}`}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
