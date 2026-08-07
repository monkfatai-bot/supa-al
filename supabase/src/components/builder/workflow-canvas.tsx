"use client";

/**
 * Supa AI — Phase 9B Builder — workflow canvas.
 *
 * A div-based, pan + zoom canvas that renders every workflow node as an
 * absolutely-positioned card and draws SVG edges between connected nodes.
 *
 * Drop targets: the canvas is a @dnd-kit `Droppable` — dropping a node
 * palette item creates a new node at the cursor's canvas coordinates.
 * Existing nodes are draggable via @dnd-kit (`useDraggable`) — when a
 * node is dropped, the `onNodeMove` callback fires with the new canvas
 * coordinates so the parent can persist the position.
 *
 * Edges are drawn as straight SVG lines between the source node's right
 * port and the target node's left port. A future Phase can swap this
 * for a proper beziers implementation; straight lines are sufficient
 * for V1.
 *
 * @module @/components/builder/workflow-canvas
 */
import * as React from "react";
import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import type {
  CanvasPoint,
  NodeDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/lib/builder/client";
import { nodeRegistry } from "@/lib/builder/node-definitions";
import { Button } from "@/components/ui/button";

/** Category-aware accent color for a node card border. */
const CATEGORY_COLORS: Record<string, string> = {
  trigger: "border-emerald-500/60",
  action: "border-blue-500/60",
  condition: "border-amber-500/60",
  transform: "border-purple-500/60",
  ai: "border-pink-500/60",
  integration: "border-orange-500/60",
  output: "border-slate-500/60",
};

export interface CanvasNode extends WorkflowNode {
  /** Convenience: the catalog type name resolved from the node's config. */
  catalogType?: string;
}

export interface WorkflowCanvasProps {
  nodes: CanvasNode[];
  edges: WorkflowEdge[];
  selectedNodeKey: string | null;
  /** Zoom factor (1 = 100%). */
  zoom: number;
  /** Canvas viewport pan offset (canvas coordinates). */
  pan: CanvasPoint;
  onSelectNode: (nodeKey: string | null) => void;
  onNodeMove: (nodeKey: string, position: CanvasPoint) => void;
  onPanChange: (pan: CanvasPoint) => void;
  onZoomChange: (zoom: number) => void;
  /** Optional: drag-drop new node from palette (called with canvas coords). */
  onDropNode?: (nodeType: string, position: CanvasPoint) => void;
  className?: string;
}

const NODE_W = 200;
const NODE_H = 64;

/** Coerce a jsonb position column into a typed `{ x, y }`. */
function readPoint(value: unknown): { x: number; y: number } {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { x?: unknown; y?: unknown };
    const x = typeof obj.x === "number" ? obj.x : 0;
    const y = typeof obj.y === "number" ? obj.y : 0;
    return { x, y };
  }
  return { x: 0, y: 0 };
}

export function WorkflowCanvas({
  nodes,
  edges,
  selectedNodeKey,
  zoom,
  pan,
  onSelectNode,
  onNodeMove,
  onPanChange,
  onZoomChange,
  onDropNode,
  className,
}: WorkflowCanvasProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "builder-canvas",
    data: { kind: "canvas" },
  });

  // Track the canvas element so we can convert viewport coords → canvas coords.
  const canvasRef = React.useRef<HTMLDivElement>(null);

  const toCanvasCoords = React.useCallback(
    (clientX: number, clientY: number): CanvasPoint => {
      const el = canvasRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      // The canvas's center is the origin (so pan starts at {0,0}).
      const vx = (clientX - rect.left - rect.width / 2) / zoom - pan.x;
      const vy = (clientY - rect.top - rect.height / 2) / zoom - pan.y;
      return { x: vx, y: vy };
    },
    [pan, zoom],
  );

  // --- Node drag state (canvas-local, NOT @dnd-kit — keep it simple). ---
  const dragState = React.useRef<{
    nodeKey: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const handleNodePointerDown = React.useCallback(
    (e: React.PointerEvent, node: WorkflowNode) => {
      // Only left-click initiates a drag.
      if (e.button !== 0) return;
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      // The node's top-left in canvas coords.
      const nodePos = readPoint(node.position);
      const nodeX = nodePos.x;
      const nodeY = nodePos.y;
      // The pointer's canvas coords.
      const px = (e.clientX - center.x) / zoom - pan.x;
      const py = (e.clientY - center.y) / zoom - pan.y;
      dragState.current = {
        nodeKey: node.node_key,
        offsetX: px - nodeX,
        offsetY: py - nodeY,
      };
      onSelectNode(node.node_key);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    },
    [pan, zoom, onSelectNode],
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragState.current) return;
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      const px = (e.clientX - center.x) / zoom - pan.x;
      const py = (e.clientY - center.y) / zoom - pan.y;
      onNodeMove(dragState.current.nodeKey, {
        x: Math.round(px - dragState.current.offsetX),
        y: Math.round(py - dragState.current.offsetY),
      });
    },
    [pan, zoom, onNodeMove],
  );

  const handlePointerUp = React.useCallback(() => {
    dragState.current = null;
  }, []);

  // --- Canvas pan (right-mouse / space-drag). ---
  const panState = React.useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const handleCanvasPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      // Background click clears selection.
      if (e.target === e.currentTarget || e.target === canvasRef.current) {
        onSelectNode(null);
      }
      // Middle mouse OR space+left pans.
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        panState.current = {
          startX: e.clientX,
          startY: e.clientY,
          originX: pan.x,
          originY: pan.y,
        };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    },
    [pan, onSelectNode],
  );

  const handleCanvasPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!panState.current) return;
      const dx = (e.clientX - panState.current.startX) / zoom;
      const dy = (e.clientY - panState.current.startY) / zoom;
      onPanChange({
        x: panState.current.originX + dx,
        y: panState.current.originY + dy,
      });
    },
    [zoom, onPanChange],
  );

  const handleCanvasPointerUp = React.useCallback(() => {
    panState.current = null;
  }, []);

  // Wheel: ctrl/cmd to zoom, otherwise pan.
  const handleWheel = React.useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        const next = Math.max(0.25, Math.min(2, zoom + delta));
        onZoomChange(Number(next.toFixed(2)));
      }
    },
    [zoom, onZoomChange],
  );

  // Drop handler — @dnd-kit's onDragEnd is dispatched from the parent
  // (BuilderView) which owns the DndContext. But we also expose a direct
  // DOM-level drop handler as a fallback.
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el || !onDropNode) return;
    const handle = (e: DragEvent) => {
      const nodeType = e.dataTransfer?.getData("application/x-builder-node-type");
      if (!nodeType) return;
      e.preventDefault();
      const p = toCanvasCoords(e.clientX, e.clientY);
      onDropNode(nodeType, p);
    };
    el.addEventListener("drop", handle);
    return () => el.removeEventListener("drop", handle);
  }, [onDropNode, toCanvasCoords]);

  // Render edges as SVG lines between connected nodes' port centers.
  const nodeById = React.useMemo(() => {
    const m = new Map<string, WorkflowNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  return (
    <div
      ref={canvasRef}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={(e) => {
        handleCanvasPointerMove(e);
        handlePointerMove(e);
      }}
      onPointerUp={() => {
        handleCanvasPointerUp();
        handlePointerUp();
      }}
      onWheel={handleWheel}
      className={cn(
        "relative flex-1 cursor-default overflow-hidden bg-grid [background-size:24px_24px] [background-image:linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)]",
        isOver && "ring-2 ring-primary/40",
        className,
      )}
      style={{ touchAction: "none" }}
    >
      {/* The "viewport transform" — pan + zoom applied via CSS transform on an inner div. */}
      <div
        ref={setNodeRef}
        className="absolute left-1/2 top-1/2"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center",
        }}
      >
        {/* SVG edges layer. The SVG is positioned to cover a generous area
            around the origin so lines render regardless of node positions. */}
        <svg
          aria-hidden="true"
          width="6000"
          height="6000"
          viewBox="-3000 -3000 6000 6000"
          className="pointer-events-none absolute"
          style={{
            left: -3000,
            top: -3000,
          }}
        >
          {edges.map((edge) => {
            const source = nodeById.get(edge.source_node_id);
            const target = nodeById.get(edge.target_node_id);
            if (!source || !target) return null;
            const sPos = readPoint(source.position);
            const tPos = readPoint(target.position);
            const sx = sPos.x + NODE_W;
            const sy = sPos.y + NODE_H / 2;
            const tx = tPos.x;
            const ty = tPos.y + NODE_H / 2;
            return (
              <g key={edge.id}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeOpacity={0.5}
                />
                {edge.label && (
                  <text
                    x={(sx + tx) / 2}
                    y={(sy + ty) / 2 - 4}
                    fill="hsl(var(--muted-foreground))"
                    fontSize={11}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.length === 0 && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sm text-muted-foreground">
            <p className="mb-1 font-medium">Empty workflow</p>
            <p className="text-xs">
              Drag a trigger node from the palette to get started.
            </p>
          </div>
        )}

        {nodes.map((node) => {
          const pos = readPoint(node.position);
          const x = pos.x;
          const y = pos.y;
          const isSelected = node.node_key === selectedNodeKey;
          const def: NodeDefinition | undefined = nodeRegistry.find(
            node.catalogType ?? (typeof node.config === "object" && node.config !== null
              ? ((node.config as Record<string, unknown>).__type__ as string | undefined) ?? node.node_type
              : node.node_type),
          );
          return (
            <div
              key={node.id}
              onPointerDown={(e) => handleNodePointerDown(e, node)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(node.node_key);
              }}
              className={cn(
                "absolute flex w-[200px] cursor-grab flex-col gap-1 rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing",
                CATEGORY_COLORS[node.node_type] ?? "border-border",
                isSelected && "ring-2 ring-primary",
                !node.is_enabled && "opacity-50",
              )}
              style={{ left: x, top: y, height: NODE_H }}
              title={def?.description ?? node.label}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {def?.icon ?? "□"}
                </span>
                <span className="truncate text-xs font-medium">
                  {node.label || def?.label || node.node_key}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="truncate">{node.node_key}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase">
                  {node.node_type}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom controls (bottom-right). */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md border bg-background/80 p-1 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.1).toFixed(2))))}
          aria-label="Zoom out"
        >
          −
        </Button>
        <span className="w-12 text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => onZoomChange(Math.min(2, Number((zoom + 0.1).toFixed(2))))}
          aria-label="Zoom in"
        >
          +
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            onZoomChange(1);
            onPanChange({ x: 0, y: 0 });
          }}
          aria-label="Reset view"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
