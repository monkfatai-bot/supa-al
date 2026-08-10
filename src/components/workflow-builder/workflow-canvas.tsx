'use client';

import '@xyflow/react/dist/style.css';

import { useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  ConnectionLineType,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { validateWorkflow, type NodeDefinition } from '@/services/workflow-builder';
import { addWorkflowNode, addWorkflowEdge, saveWorkflowLayout } from '@/services/workflow-builder/actions';
import type { Json } from '@/types/generated/database';
import { useWorkflowBuilderStore } from '@/services/workflow-builder/store';
import { nodeTypes } from './custom-nodes';

// ─── Shared ReactFlow instance ref (used by toolbar) ─────────────
export const workflowCanvasInstance = {
  current: null as ReactFlowInstance | null,
};

// ─── Category node colors for the minimap ──────────────────────────
const CATEGORY_NODE_COLORS: Record<string, string> = {
  trigger: '#10b981',
  ai: '#8b5cf6',
  logic: '#f59e0b',
  data: '#0ea5e9',
  communication: '#f43f5e',
  business: '#f97316',
  integration: '#71717a',
};

// ─── Auto-save helper ──────────────────────────────────────────────
async function performAutoSave() {
  const s = useWorkflowBuilderStore.getState();
  if (!s.workflowId || !s.isDirty) return;
  s.setSaving(true);
  try {
    /* Auto-save layout only; full canvas save is handled by toolbar */
    await saveWorkflowLayout(s.workflowId, s.viewport, s.viewport.zoom, {});
  } catch {
    // Silently fail for auto-save
  } finally {
    s.setSaving(false);
  }
}

// ─── WorkflowCanvas Component ────────────────────────────────────────
export function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Store selectors
  const nodes = useWorkflowBuilderStore((s) => s.nodes);
  const edges = useWorkflowBuilderStore((s) => s.edges);
  const workflowId = useWorkflowBuilderStore((s) => s.workflowId);
  const panels = useWorkflowBuilderStore((s) => s.panels);

  const setNodes = useWorkflowBuilderStore((s) => s.setNodes);
  const setEdges = useWorkflowBuilderStore((s) => s.setEdges);
  const addNode = useWorkflowBuilderStore((s) => s.addNode);
  const addEdgeStore = useWorkflowBuilderStore((s) => s.addEdge);

  const selectNode = useWorkflowBuilderStore((s) => s.selectNode);
  const selectEdge = useWorkflowBuilderStore((s) => s.selectEdge);
  const clearSelection = useWorkflowBuilderStore((s) => s.clearSelection);
  const selectAll = useWorkflowBuilderStore((s) => s.selectAll);
  const setViewport = useWorkflowBuilderStore((s) => s.setViewport);

  const undo = useWorkflowBuilderStore((s) => s.undo);
  const redo = useWorkflowBuilderStore((s) => s.redo);
  const zoomIn = useWorkflowBuilderStore((s) => s.zoomIn);
  const zoomOut = useWorkflowBuilderStore((s) => s.zoomOut);
  const fitView = useWorkflowBuilderStore((s) => s.fitView);
  const setValidationErrors = useWorkflowBuilderStore((s) => s.setValidationErrors);
  const triggerAutoSave = useWorkflowBuilderStore((s) => s.triggerAutoSave);
  const addBreakpoint = useWorkflowBuilderStore((s) => s.addBreakpoint);
  const removeBreakpoint = useWorkflowBuilderStore((s) => s.removeBreakpoint);

  // ─── Validation: run whenever nodes/edges change ────────────────
  useEffect(() => {
    const errors = validateWorkflow(nodes, edges);
    setValidationErrors(errors);
  }, [nodes, edges, setValidationErrors]);

  // ─── Auto-save: trigger when nodes/edges change (debounced) ──
  useEffect(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    triggerAutoSave(performAutoSave);
    return () => {
      const timer = useWorkflowBuilderStore.getState().autoSaveTimer;
      if (timer) clearTimeout(timer);
    };
  }, [nodes, edges, triggerAutoSave]);

  // ─── onInit: store the ReactFlow instance ─────────────────────
  const onInit = useCallback((instance: ReactFlowInstance) => {
    workflowCanvasInstance.current = instance;
  }, []);

  // ─── onDrop: parse dragged node and add to canvas ────────────
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const rawData = event.dataTransfer.getData('application/reactflow');
      if (!rawData) return;

      let nodeDef: NodeDefinition;
      try {
        nodeDef = JSON.parse(rawData) as NodeDefinition;
      } catch {
        return;
      }

      const instance = workflowCanvasInstance.current;
      if (!instance) return;

      const position = instance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: uuidv4(),
        type: 'workflow',
        position,
        data: {
          label: nodeDef.label,
          nodeCategory: nodeDef.category,
          nodeType: nodeDef.type,
          icon: nodeDef.icon,
          color: nodeDef.color,
          description: nodeDef.description,
          isEnabled: true,
          hasBreakpoint: false,
          config: { ...nodeDef.defaultConfig },
        },
      };

      addNode(newNode);

      // Fire-and-forget: persist to DB
      if (workflowId) {
        const now = () => new Date().toISOString();
        addWorkflowNode(workflowId, {
          id: newNode.id,
          workflow_id: workflowId,
          node_key: newNode.id,
          node_type: nodeDef.type,
          node_category: nodeDef.category,
          label: nodeDef.label,
          description: nodeDef.description,
          position_x: Math.round(position.x),
          position_y: Math.round(position.y),
          config: nodeDef.defaultConfig as unknown as Json,
          is_enabled: true,
          created_at: now(),
          updated_at: now(),
        }).catch(() => {
          /* fire-and-forget */
        });
      }
    },
    [addNode, workflowId],
  );

  // ─── onDragOver: allow drop ───────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ─── onConnect: validate and add edge ──────────────────────────
  const onConnect = useCallback(
    (connection: Connection) => {
      // No self-loops
      if (connection.source === connection.target) return;

      // Trigger nodes must never be targets
      const targetNode = nodes.find((n) => n.id === connection.target);
      if (targetNode) {
        const cat = (targetNode.data as Record<string, unknown>)?.nodeCategory as string | undefined;
        if (cat === 'trigger') return;
      }

      const newEdge: Edge = {
        id: uuidv4(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        type: 'smoothstep',
      };

      addEdgeStore(newEdge);

      // Fire-and-forget: persist to DB
      if (workflowId) {
        const now = () => new Date().toISOString();
        addWorkflowEdge(workflowId, {
          id: newEdge.id,
          workflow_id: workflowId,
          edge_key: newEdge.id,
          source_node_id: connection.source,
          target_node_id: connection.target,
          source_handle: connection.sourceHandle ?? undefined,
          target_handle: connection.targetHandle ?? undefined,
          created_at: now(),
          updated_at: now(),
        }).catch(() => {
          /* fire-and-forget */
        });
      }
    },
    [addEdgeStore, nodes, workflowId],
  );

  // ─── onNodesChange: apply changes, only push history for structural changes
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const hasStructural = changes.some(
        (c) => c.type === 'remove',
      );
      const updated = applyNodeChanges(changes, nodes);
      setNodes(updated);
      if (hasStructural) {
        useWorkflowBuilderStore.getState().pushHistory('Node structure changed');
      }
    },
    [nodes, setNodes],
  );

  // ─── onEdgesChange: apply changes and sync store ──────────────
  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updated = applyEdgeChanges(changes, edges);
      setEdges(updated);
    },
    [edges, setEdges],
  );

  // ─── onNodeClick: select node, open right panel ────────────────
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const isMulti = _event.shiftKey;
      selectNode(node.id, isMulti);
      if (!isMulti) {
        const { panels } = useWorkflowBuilderStore.getState();
        if (!panels.right) {
          useWorkflowBuilderStore.getState().togglePanel('right');
        }
      }
    },
    [selectNode],
  );

  // ─── onEdgeClick: select edge ─────────────────────────────────
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      selectEdge(edge.id, _event.shiftKey);
    },
    [selectEdge],
  );

  // ─── onPaneClick: clear selection ─────────────────────────────
  const onPaneClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // ─── onNodeDoubleClick: toggle breakpoint ─────────────────────
  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const state = useWorkflowBuilderStore.getState();
      if (state.debug.breakpointNodeIds.includes(node.id)) {
        removeBreakpoint(node.id);
      } else {
        addBreakpoint(node.id);
      }
    },
    [addBreakpoint, removeBreakpoint],
  );

  // ─── onMoveEnd: sync viewport and trigger auto-save ────────────
  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | WheelEvent | null, viewport: { x: number; y: number; zoom: number }) => {
      setViewport(viewport);
      triggerAutoSave(performAutoSave);
    },
    [setViewport, triggerAutoSave],
  );

  // ─── Duplicate selected nodes ──────────────────────────────────
  const duplicateSelected = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    const selected = state.nodes.filter((n) =>
      state.selectedNodeIds.includes(n.id),
    );
    if (selected.length === 0) return;

    const newNodes: Node[] = selected.map((n) => ({
      ...n,
      id: uuidv4(),
      position: { x: n.position.x + 50, y: n.position.y + 50 },
      selected: false,
      data: { ...n.data },
    }));

    for (const node of newNodes) {
      state.addNode(node);
    }
  }, []);

  // ─── Delete selected nodes and edges ──────────────────────────
  const deleteSelected = useCallback(() => {
    const state = useWorkflowBuilderStore.getState();
    if (state.selectedNodeIds.length > 0) {
      state.removeNodes([...state.selectedNodeIds]);
    }
    if (state.selectedEdgeIds.length > 0) {
      state.removeEdges([...state.selectedEdgeIds]);
    }
  }, []);

  // ─── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;

      // Ctrl+Z → undo
      if (isCtrl && !isShift && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z → redo
      if (isCtrl && isShift && e.key === 'z') {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+Shift+Z also on y
      if (isCtrl && isShift && e.key === 'Y') {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+S → save
      if (isCtrl && e.key === 's') {
        e.preventDefault();
        performAutoSave();
        return;
      }

      // Ctrl+D → duplicate selected
      if (isCtrl && e.key === 'd') {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Delete / Backspace → remove selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // Ctrl+A → select all
      if (isCtrl && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Ctrl+= → zoom in
      if (isCtrl && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }

      // Ctrl+- → zoom out
      if (isCtrl && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // Ctrl+0 → fit view
      if (isCtrl && e.key === '0') {
        e.preventDefault();
        fitView();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, duplicateSelected, deleteSelected, selectAll, zoomIn, zoomOut, fitView]);

  // ─── Memoized nodeType map (stable reference) ──────────────────
  const stableNodeTypes = useMemo(() => nodeTypes, []);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={stableNodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: 'hsl(var(--border))', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDoubleClick={onNodeDoubleClick}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode="Shift"
        selectionOnDrag
        selectNodesOnDrag
        minZoom={0.1}
        maxZoom={2}
        onMoveEnd={onMoveEnd}
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        {panels.minimap && (
          <MiniMap
            nodeColor={(node) =>
              CATEGORY_NODE_COLORS[(node.data as Record<string, unknown>)?.nodeCategory as string] ||
              '#71717a'
            }
            maskColor="rgba(0,0,0,0.1)"
            pannable
            zoomable
            style={{ width: 180, height: 120 }}
          />
        )}
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
