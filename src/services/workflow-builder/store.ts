/**
 * @module workflow-builder/store
 * @description Zustand store for the Visual Workflow Builder.
 *
 * Manages all canvas state (nodes, edges, selection), undo/redo history,
 * auto-save throttling, UI panel toggles, debug state, validation errors,
 * and real-time collaboration data.
 *
 * Uses zustand 5 with no immer — all mutations are via direct `set()` calls
 * with spread patterns.
 */

import { create } from 'zustand';
import type { Node, Edge } from '@xyflow/react';
import type { Json } from '@/types/generated/database';
import type {
  HistoryEntry,
  PanelState,
  DebugState,
  ValidationError,
  ActivityFeedEntry,
  WorkflowCommentWithAuthor,
} from './types';

// ─── Store Interface ──────────────────────────────────────

export interface WorkflowBuilderState {
  // --- Data ---
  nodes: Node[];
  edges: Edge[];
  workflowId: string | null;
  workflowName: string;
  isDirty: boolean;
  isLoading: boolean;
  isSaving: boolean;

  // --- Selection ---
  selectedNodeIds: string[];
  selectedEdgeIds: string[];

  // --- UI Panels ---
  panels: PanelState;

  // --- History ---
  history: HistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;

  // --- Viewport ---
  viewport: { x: number; y: number; zoom: number };

  // --- Search ---
  searchQuery: string;
  searchCategory: string | null;

  // --- Debug ---
  debug: DebugState;

  // --- Validation ---
  validationErrors: ValidationError[];

  // --- Collaboration ---
  activeUsers: Array<{
    userId: string;
    userName: string;
    color: string;
    cursorPosition?: { x: number; y: number };
  }>;
  comments: WorkflowCommentWithAuthor[];
  activityFeed: ActivityFeedEntry[];

  // --- Auto-save ---
  lastSavedAt: number | null;
  autoSaveTimer: ReturnType<typeof setTimeout> | null;

  // --- Actions ---
  init: (
    workflowId: string,
    name: string,
    nodes: Node[],
    edges: Edge[],
  ) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node) => void;
  updateNode: (id: string, data: Partial<Node>) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (edge: Edge) => void;
  updateEdge: (id: string, data: Partial<Edge>) => void;
  removeEdges: (ids: string[]) => void;
  selectNode: (id: string, multi?: boolean) => void;
  selectEdge: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  selectAll: () => void;
  togglePanel: (panel: keyof PanelState) => void;
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitView: () => void;
  setSearch: (query: string, category?: string | null) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: (description?: string) => void;
  clearHistory: () => void;
  setDirty: (dirty: boolean) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setDebugState: (partial: Partial<DebugState>) => void;
  addBreakpoint: (nodeId: string) => void;
  removeBreakpoint: (nodeId: string) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  clearValidationErrors: () => void;
  setActiveUsers: (
    users: Array<{
      userId: string;
      userName: string;
      color: string;
      cursorPosition?: { x: number; y: number };
    }>,
  ) => void;
  addComment: (comment: WorkflowCommentWithAuthor) => void;
  setActivityFeed: (entries: ActivityFeedEntry[]) => void;
  triggerAutoSave: (onSave: () => Promise<void>) => void;
  reset: () => void;
  dispose: () => void;
}

// ─── Helper ───────────────────────────────────────────────

function recalcHistoryFlags(
  history: HistoryEntry[],
  historyIndex: number,
): { canUndo: boolean; canRedo: boolean } {
  return {
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}

// ─── Initial state ────────────────────────────────────────

const INITIAL_PANELS: PanelState = {
  left: true,
  right: false,
  bottom: false,
  minimap: true,
};

const INITIAL_DEBUG: DebugState = {
  isDebugging: false,
  currentStepIndex: -1,
  isPaused: false,
  breakpointNodeIds: [],
  variableSnapshot: {},
  executionTimeline: [],
};

// ─── Store ────────────────────────────────────────────────

export const useWorkflowBuilderStore = create<WorkflowBuilderState>((
  set,
  get,
) => ({
  // --- Data ---
  nodes: [],
  edges: [],
  workflowId: null,
  workflowName: '',
  isDirty: false,
  isLoading: false,
  isSaving: false,

  // --- Selection ---
  selectedNodeIds: [],
  selectedEdgeIds: [],

  // --- UI Panels ---
  panels: { ...INITIAL_PANELS },

  // --- History ---
  history: [],
  historyIndex: -1,
  canUndo: false,
  canRedo: false,

  // --- Viewport ---
  viewport: { x: 0, y: 0, zoom: 1 },

  // --- Search ---
  searchQuery: '',
  searchCategory: null,

  // --- Debug ---
  debug: { ...INITIAL_DEBUG },

  // --- Validation ---
  validationErrors: [],

  // --- Collaboration ---
  activeUsers: [],
  comments: [],
  activityFeed: [],

  // --- Auto-save ---
  lastSavedAt: null,
  autoSaveTimer: null,

  // ============================================================
  // Actions
  // ============================================================

  init: (workflowId, name, nodes, edges) => {
    const snapshot: HistoryEntry = {
      nodes: nodes as unknown as Json,
      edges: edges as unknown as Json,
      timestamp: Date.now(),
      description: 'Initial state',
    };
    set({
      workflowId,
      workflowName: name,
      nodes,
      edges,
      history: [snapshot],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
      isDirty: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      validationErrors: [],
    });
  },

  setNodes: (nodes) => {
    set({ nodes });
  },

  setEdges: (edges) => {
    set({ edges });
  },

  addNode: (node) => {
    const { nodes } = get();
    set({ nodes: [...nodes, node] });
    get().pushHistory(`Add node ${node.id}`);
  },

  updateNode: (id, data) => {
    const { nodes } = get();
    set({
      nodes: nodes.map((n) => (n.id === id ? { ...n, ...data } : n)),
    });
    get().pushHistory(`Update node ${id}`);
  },

  removeNodes: (ids) => {
    const idSet = new Set(ids);
    const { nodes, edges } = get();
    const filteredNodes = nodes.filter((n) => !idSet.has(n.id));
    const filteredEdges = edges.filter(
      (e) => !idSet.has(e.source) && !idSet.has(e.target),
    );
    set({
      nodes: filteredNodes,
      edges: filteredEdges,
      selectedNodeIds: get().selectedNodeIds.filter((id) => !idSet.has(id)),
    });
    get().pushHistory(`Remove ${ids.length} node(s)`);
  },

  addEdge: (edge) => {
    const { edges } = get();
    // Prevent duplicate edges (same source handle → same target handle)
    const exists = edges.some(
      (e) =>
        e.source === edge.source &&
        e.sourceHandle === edge.sourceHandle &&
        e.target === edge.target &&
        e.targetHandle === edge.targetHandle,
    );
    if (exists) return;
    // Prevent self-loops
    if (edge.source === edge.target) return;
    set({ edges: [...edges, edge] });
    get().pushHistory(`Add edge ${edge.source}→${edge.target}`);
  },

  updateEdge: (id, data) => {
    const { edges } = get();
    set({
      edges: edges.map((e) => (e.id === id ? { ...e, ...data } : e)),
    });
    get().pushHistory(`Update edge ${id}`);
  },

  removeEdges: (ids) => {
    const idSet = new Set(ids);
    const { edges } = get();
    set({
      edges: edges.filter((e) => !idSet.has(e.id)),
      selectedEdgeIds: get().selectedEdgeIds.filter((id) => !idSet.has(id)),
    });
    get().pushHistory(`Remove ${ids.length} edge(s)`);
  },

  selectNode: (id, multi = false) => {
    const { selectedNodeIds } = get();
    if (multi) {
      const idx = selectedNodeIds.indexOf(id);
      if (idx >= 0) {
        set({ selectedNodeIds: selectedNodeIds.filter((i) => i !== id) });
      } else {
        set({ selectedNodeIds: [...selectedNodeIds, id] });
      }
    } else {
      set({ selectedNodeIds: [id], selectedEdgeIds: [] });
    }
  },

  selectEdge: (id, multi = false) => {
    const { selectedEdgeIds } = get();
    if (multi) {
      const idx = selectedEdgeIds.indexOf(id);
      if (idx >= 0) {
        set({ selectedEdgeIds: selectedEdgeIds.filter((i) => i !== id) });
      } else {
        set({ selectedEdgeIds: [...selectedEdgeIds, id] });
      }
    } else {
      set({ selectedEdgeIds: [id], selectedNodeIds: [] });
    }
  },

  clearSelection: () => {
    set({ selectedNodeIds: [], selectedEdgeIds: [] });
  },

  selectAll: () => {
    const { nodes } = get();
    set({
      selectedNodeIds: nodes.map((n) => n.id),
      selectedEdgeIds: [],
    });
  },

  togglePanel: (panel) => {
    const { panels } = get();
    set({ panels: { ...panels, [panel]: !panels[panel] } });
  },

  setViewport: (vp) => {
    set({ viewport: vp });
  },

  zoomIn: () => {
    const { viewport } = get();
    const zoom = Math.min(viewport.zoom + 0.1, 2);
    set({ viewport: { ...viewport, zoom } });
  },

  zoomOut: () => {
    const { viewport } = get();
    const zoom = Math.max(viewport.zoom - 0.1, 0.1);
    set({ viewport: { ...viewport, zoom } });
  },

  fitView: () => {
    set({ viewport: { x: 0, y: 0, zoom: 1 } });
  },

  setSearch: (query, category = null) => {
    set({ searchQuery: query, searchCategory: category });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    const entry = history[newIndex];
    const flags = recalcHistoryFlags(history, newIndex);
    set({
      nodes: entry.nodes as unknown as Node[],
      edges: entry.edges as unknown as Edge[],
      historyIndex: newIndex,
      ...flags,
      isDirty: true,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    const entry = history[newIndex];
    const flags = recalcHistoryFlags(history, newIndex);
    set({
      nodes: entry.nodes as unknown as Node[],
      edges: entry.edges as unknown as Edge[],
      historyIndex: newIndex,
      ...flags,
      isDirty: true,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });
  },

  pushHistory: (description = 'Change') => {
    const { nodes, edges, history, historyIndex } = get();
    const entry: HistoryEntry = {
      nodes: nodes as unknown as Json,
      edges: edges as unknown as Json,
      timestamp: Date.now(),
      description,
    };
    // Truncate any redo entries after current index
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(entry);
    // Keep max 50
    if (newHistory.length > 50) newHistory.shift();
    const newIndex = newHistory.length - 1;
    const flags = recalcHistoryFlags(newHistory, newIndex);
    set({
      history: newHistory,
      historyIndex: newIndex,
      ...flags,
      isDirty: true,
    });
  },

  clearHistory: () => {
    const { nodes, edges } = get();
    const snapshot: HistoryEntry = {
      nodes: nodes as unknown as Json,
      edges: edges as unknown as Json,
      timestamp: Date.now(),
      description: 'Cleared history',
    };
    set({
      history: [snapshot],
      historyIndex: 0,
      canUndo: false,
      canRedo: false,
    });
  },

  setDirty: (dirty) => {
    set({ isDirty: dirty });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setSaving: (saving) => {
    set({ isSaving: saving });
  },

  setDebugState: (partial) => {
    const { debug } = get();
    set({ debug: { ...debug, ...partial } });
  },

  addBreakpoint: (nodeId) => {
    const { debug } = get();
    if (debug.breakpointNodeIds.includes(nodeId)) return;
    set({
      debug: {
        ...debug,
        breakpointNodeIds: [...debug.breakpointNodeIds, nodeId],
      },
    });
  },

  removeBreakpoint: (nodeId) => {
    const { debug } = get();
    set({
      debug: {
        ...debug,
        breakpointNodeIds: debug.breakpointNodeIds.filter((id) => id !== nodeId),
      },
    });
  },

  setValidationErrors: (errors) => {
    set({ validationErrors: errors });
  },

  clearValidationErrors: () => {
    set({ validationErrors: [] });
  },

  setActiveUsers: (users) => {
    set({ activeUsers: users });
  },

  addComment: (comment) => {
    const { comments } = get();
    set({ comments: [...comments, comment] });
  },

  setActivityFeed: (entries) => {
    set({ activityFeed: entries });
  },

  triggerAutoSave: (onSave) => {
    const { autoSaveTimer } = get();
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    const timer = setTimeout(async () => {
      await onSave();
      set({ lastSavedAt: Date.now(), isDirty: false });
    }, 3000);
    set({ autoSaveTimer: timer });
  },

  reset: () => {
    const { autoSaveTimer } = get();
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    set({
      nodes: [],
      edges: [],
      workflowId: null,
      workflowName: '',
      isDirty: false,
      isLoading: false,
      isSaving: false,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      panels: { ...INITIAL_PANELS },
      history: [],
      historyIndex: -1,
      canUndo: false,
      canRedo: false,
      viewport: { x: 0, y: 0, zoom: 1 },
      searchQuery: '',
      searchCategory: null,
      debug: { ...INITIAL_DEBUG },
      validationErrors: [],
      activeUsers: [],
      comments: [],
      activityFeed: [],
      lastSavedAt: null,
      autoSaveTimer: null,
    });
  },

  dispose: () => {
    const { autoSaveTimer } = get();
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      set({ autoSaveTimer: null });
    }
  },
}));
