'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import { saveWorkflowCanvas, getTemplateCategories } from '@/services/workflow-builder/actions';
import { useWorkflowCollaboration } from '@/hooks/use-workflow-collaboration';
import { NodePalette } from './node-palette';
import { WorkflowCanvas } from './workflow-canvas';
import { ConfigPanel } from './config-panel';
import { DebugPanel } from './debug-panel';
import { BuilderToolbar } from './builder-toolbar';
import { ActiveUsersIndicator } from './active-users-indicator';
import { CollaborationCursorOverlay } from './collaboration-cursor-overlay';
import { ActivityFeed } from './activity-feed';
import type { InsertTables, Json } from '@/types/generated/database';

// ─── Props ──────────────────────────────────────────────

interface WorkflowBuilderProps {
  workflowId: string;
  workflowName: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
}

// ─── WorkflowBuilder Component ──────────────────────────

export function WorkflowBuilder({
  workflowId,
  workflowName,
  initialNodes = [],
  initialEdges = [],
}: WorkflowBuilderProps) {
  const init = useWorkflowBuilderStore((s) => s.init);
  const panels = useWorkflowBuilderStore((s) => s.panels);
  const isLoading = useWorkflowBuilderStore((s) => s.isLoading);
  const nodes = useWorkflowBuilderStore((s) => s.nodes);
  const edges = useWorkflowBuilderStore((s) => s.edges);
  const setActivityFeed = useWorkflowBuilderStore((s) => s.setActivityFeed);
  const disposedRef = useRef(false);

  // ─── Real-time collaboration ───────────────────────────
  useWorkflowCollaboration(workflowId);

  // ─── Initialize store on mount ────────────────────────
  useEffect(() => {
    disposedRef.current = false;
    init(workflowId, workflowName, initialNodes, initialEdges);

    // Load template categories in background
    getTemplateCategories().catch(() => {});

    // Load activity feed placeholder
    setActivityFeed([]);

    return () => {
      disposedRef.current = true;
      useWorkflowBuilderStore.getState().dispose();
    };
  }, [workflowId, workflowName, initialNodes, initialEdges, init, setActivityFeed]);

  // ─── Auto-save callback ──────────────────────────────
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
      await saveWorkflowCanvas(
        state.workflowId,
        dbNodes,
        dbEdges,
        state.viewport,
        state.viewport.zoom,
      );
      if (!disposedRef.current) {
        state.setDirty(false);
      }
    } catch {
      if (!disposedRef.current) {
        toast.error('Auto-save failed');
      }
    } finally {
      if (!disposedRef.current) {
        state.setSaving(false);
      }
    }
  }, []);

  // ─── Trigger auto-save when dirty ────────────────────
  const isDirty = useWorkflowBuilderStore((s) => s.isDirty);
  const triggerAutoSave = useWorkflowBuilderStore((s) => s.triggerAutoSave);
  useEffect(() => {
    if (isDirty) {
      triggerAutoSave(handleSave);
    }
  }, [isDirty, nodes, edges, triggerAutoSave, handleSave]);

  // ─── Loading skeleton ────────────────────────────────
  if (isLoading && nodes.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center border-b px-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="ml-4 h-6 w-16" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-20" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <Skeleton className="w-72 border-r" />
          <div className="flex-1 bg-muted/20" />
          <Skeleton className="w-80 border-l" />
        </div>
      </div>
    );
  }

  // ─── Main Layout ─────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      <div className="relative">
        <BuilderToolbar />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <ActiveUsersIndicator workflowId={workflowId} />
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="workflow-builder-layout">
          {panels.left && (
            <>
              <Panel defaultSize={18} minSize={14} maxSize={25}>
                <NodePalette />
              </Panel>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
            </>
          )}
          <Panel defaultSize={panels.right ? 64 : 82}>
            <div className="relative h-full">
              <WorkflowCanvas />
              <CollaborationCursorOverlay workflowId={workflowId} />
              {panels.bottom && (
                <div className="absolute bottom-0 left-0 right-0 z-10">
                  <DebugPanel />
                </div>
              )}
            </div>
          </Panel>
          {panels.right && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors" />
              <Panel defaultSize={22} minSize={18} maxSize={30}>
                <div className="flex h-full flex-col">
                  <ConfigPanel />
                  <div className="border-t">
                    <ActivityFeed />
                  </div>
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
