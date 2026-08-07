"use client";

/**
 * Supa AI — Phase 9B Builder — main view container.
 *
 * Owns the builder's cross-component state and composes every sub-
 * component into a single full-height surface:
 *
 *   - Top bar: workspace picker + workflow id input + Save / Validate /
 *     Preview actions + right-panel tab switcher.
 *   - Left sidebar: {@link NodePalette} (drag node types onto the canvas).
 *   - Center: {@link WorkflowCanvas} (pan + zoom + nodes + edges).
 *   - Right sidebar: tabbed — {@link ConfigPanel} / {@link DebugConsole} /
 *     {@link CommentsPanel} / {@link VersionManager}.
 *
 * The canvas state (nodes + edges + viewport) is the source of truth
 * here — the parent saves it to the backend via {@link useSaveWorkflow}
 * and re-reads it via {@link useWorkflowGraph}. Local edits mutate the
 * in-memory copy; the user clicks Save to persist.
 *
 * Drag-drop: the whole view is wrapped in a `DndContext` (from @dnd-kit).
 * Palette items are `useDraggable`; the canvas is `useDroppable`. On
 * drag end over the canvas, a new node is created at the cursor's
 * canvas coordinates with a generated `nodeKey`.
 *
 * @module @/components/builder/builder-view
 */
import * as React from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Bug,
  CheckCircle2,
  MessageSquare,
  Play,
  Save,
  Settings2,
  TriangleAlert,
  Workflow as WorkflowIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  nodeRegistry,
  type NodeType,
} from "@/lib/builder/client";
import type { WorkflowNode, WorkflowEdge } from "@/lib/builder/client";
import { useWorkspaces } from "@/hooks/use-workspace";
import {
  useSaveWorkflow,
  useValidateWorkflow,
  usePreviewWorkflow,
  useWorkflowGraph,
} from "@/hooks/use-builder";
import type { ValidationResult, PreviewResult } from "@/lib/builder/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { NodePalette } from "./node-palette";
import { WorkflowCanvas } from "./workflow-canvas";
import { ConfigPanel } from "./config-panel";
import { DebugConsole } from "./debug-console";
import { CommentsPanel } from "./comments-panel";
import { VersionManager } from "./version-manager";

type RightTab = "config" | "debug" | "comments" | "versions";

const RIGHT_TABS: { id: RightTab; label: string; icon: typeof Bug }[] = [
  { id: "config", label: "Configure", icon: Settings2 },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "versions", label: "Versions", icon: WorkflowIcon },
];

/** Generate a stable per-workflow node key (e.g. `action_3`). */
function generateNodeKey(category: NodeType, existing: Set<string>): string {
  let n = 1;
  while (existing.has(`${category}_${n}`)) n += 1;
  return `${category}_${n}`;
}

export function BuilderView() {
  const workspacesQuery = useWorkspaces();
  const { toast } = useToast();

  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(
    null,
  );
  const [workflowId, setWorkflowId] = React.useState<string>("");
  const [activeTab, setActiveTab] = React.useState<RightTab>("config");

  // Pick the first workspace once the list loads.
  React.useEffect(() => {
    if (
      activeWorkspaceId === null &&
      workspacesQuery.data &&
      workspacesQuery.data.length > 0
    ) {
      setActiveWorkspaceId(workspacesQuery.data[0].id);
    }
  }, [activeWorkspaceId, workspacesQuery.data]);

  // --- In-memory graph state (the source of truth for the canvas). ---
  const [nodes, setNodes] = React.useState<WorkflowNode[]>([]);
  const [edges, setEdges] = React.useState<WorkflowEdge[]>([]);
  const [selectedNodeKey, setSelectedNodeKey] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map node keys to catalog types (so the config panel can render the right
  // schema for nodes that don't have a __type__ stored in config).
  const [catalogTypeByKey, setCatalogTypeByKey] = React.useState<
    Record<string, string>
  >({});

  // --- Backend graph load. ---
  const graphQuery = useWorkflowGraph(activeWorkspaceId, workflowId || null);
  React.useEffect(() => {
    if (graphQuery.data) {
      setNodes(graphQuery.data.nodes);
      setEdges(graphQuery.data.edges);
      if (graphQuery.data.layout?.viewport) {
        const vp = graphQuery.data.layout.viewport as { zoom: number; x: number; y: number };
        if (typeof vp.zoom === "number") setZoom(vp.zoom);
        if (typeof vp.x === "number" && typeof vp.y === "number") setPan({ x: vp.x, y: vp.y });
      }
    }
  }, [graphQuery.data]);

  const saveMutation = useSaveWorkflow();
  const validateMutation = useValidateWorkflow();
  const previewMutation = usePreviewWorkflow();

  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [preview, setPreview] = React.useState<PreviewResult | null>(null);

  // --- DnD sensors (only the palette uses @dnd-kit; canvas nodes use
  //     native pointer events in the canvas component). ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over, activatorEvent } = event;
      if (!over || over.id !== "builder-canvas") return;
      const data = active.data.current as
        | { kind: "palette-node"; nodeType: string }
        | undefined;
      if (!data || data.kind !== "palette-node") return;
      const def = nodeRegistry.find(data.nodeType);
      if (!def) return;

      // Compute drop coords from the activator event's clientX/Y.
      // The activator event is typed as `Event | null | undefined` by
      // @dnd-kit — cast to a MouseEvent so we can read clientX/Y.
      const ae = activatorEvent as MouseEvent | null | undefined;
      const clientX = ae?.clientX ?? 0;
      const clientY = ae?.clientY ?? 0;
      // Use the canvas element to convert to canvas coords.
      const canvasEl = canvasWrapperRef.current;
      let x = 0;
      let y = 0;
      if (canvasEl) {
        const rect = canvasEl.getBoundingClientRect();
        x = Math.round((clientX - rect.left - rect.width / 2) / zoom - pan.x);
        y = Math.round((clientY - rect.top - rect.height / 2) / zoom - pan.y);
      }

      const existingKeys = new Set(nodes.map((n) => n.node_key));
      const nodeKey = generateNodeKey(def.category, existingKeys);
      const newNode: WorkflowNode = {
        id: `${nodeKey}_local`,
        workspace_id: activeWorkspaceId ?? "",
        workflow_id: workflowId,
        node_type: def.category,
        node_key: nodeKey,
        label: def.label,
        position: { x, y },
        config: { ...def.defaultConfig, __type__: def.type } as unknown as Record<
          string,
          never
        >,
        is_enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setNodes((prev) => [...prev, newNode]);
      setCatalogTypeByKey((prev) => ({ ...prev, [nodeKey]: def.type }));
      setSelectedNodeKey(nodeKey);
    },
    [nodes, activeWorkspaceId, workflowId, zoom, pan],
  );

  // The canvas wrapper ref — used to compute drop coordinates.
  const canvasWrapperRef = React.useRef<HTMLDivElement>(null);

  // --- Node position update (dragging nodes inside the canvas). ---
  const handleNodeMove = React.useCallback(
    (nodeKey: string, position: { x: number; y: number }) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.node_key === nodeKey ? { ...n, position: { x: position.x, y: position.y } } : n,
        ),
      );
    },
    [],
  );

  // --- Config / label / enabled / delete mutations (local). ---
  const selectedNode = React.useMemo(
    () => nodes.find((n) => n.node_key === selectedNodeKey) ?? null,
    [nodes, selectedNodeKey],
  );

  const handleConfigChange = React.useCallback(
    (config: Record<string, unknown>) => {
      if (!selectedNodeKey) return;
      setNodes((prev) =>
        prev.map((n) =>
          n.node_key === selectedNodeKey
            ? { ...n, config: config as unknown as Record<string, never> }
            : n,
        ),
      );
    },
    [selectedNodeKey],
  );

  const handleLabelChange = React.useCallback(
    (label: string) => {
      if (!selectedNodeKey) return;
      setNodes((prev) =>
        prev.map((n) =>
          n.node_key === selectedNodeKey ? { ...n, label } : n,
        ),
      );
    },
    [selectedNodeKey],
  );

  const handleToggleEnabled = React.useCallback(
    (enabled: boolean) => {
      if (!selectedNodeKey) return;
      setNodes((prev) =>
        prev.map((n) =>
          n.node_key === selectedNodeKey
            ? { ...n, is_enabled: enabled }
            : n,
        ),
      );
    },
    [selectedNodeKey],
  );

  const handleDelete = React.useCallback(() => {
    if (!selectedNodeKey) return;
    setNodes((prev) => {
      const target = prev.find((n) => n.node_key === selectedNodeKey);
      if (!target) return prev;
      // Cascade delete edges that reference the deleted node.
      setEdges((edges) =>
        edges.filter(
          (e) => e.source_node_id !== target.id && e.target_node_id !== target.id,
        ),
      );
      return prev.filter((n) => n.node_key !== selectedNodeKey);
    });
    setSelectedNodeKey(null);
  }, [selectedNodeKey]);

  // --- Save / validate / preview (backend mutations). ---
  const handleSave = React.useCallback(async () => {
    if (!activeWorkspaceId || !workflowId) {
      toast({
        title: "Cannot save",
        description: "Pick a workspace and set a workflow id first.",
        variant: "destructive",
      });
      return;
    }
    try {
      const payload = {
        workspaceId: activeWorkspaceId,
        workflowId,
        nodes: nodes.map((n) => ({
          nodeKey: n.node_key,
          nodeType:
            catalogTypeByKey[n.node_key] ??
            (typeof n.config === "object" && n.config !== null
              ? ((n.config as Record<string, unknown>).__type__ as string | undefined)
              : undefined) ??
            n.node_type,
          category: n.node_type as NodeType,
          label: n.label,
          position: (n.position ?? { x: 0, y: 0 }) as { x: number; y: number },
          config: (n.config ?? {}) as Record<string, unknown>,
          isEnabled: n.is_enabled,
        })),
        edges: edges.map((e) => {
          const source = nodes.find((n) => n.id === e.source_node_id);
          const target = nodes.find((n) => n.id === e.target_node_id);
          return {
            sourceNodeKey: source?.node_key ?? "",
            targetNodeKey: target?.node_key ?? "",
            sourcePort: e.source_port,
            targetPort: e.target_port,
            label: e.label,
            condition: (e.condition ?? {}) as Record<string, unknown>,
          };
        }),
        layout: { viewport: { zoom, x: pan.x, y: pan.y } },
      };
      await saveMutation.mutateAsync({
        workflowId,
        input: payload,
      });
      toast({ title: "Workflow saved", description: `${nodes.length} nodes persisted.` });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [
    activeWorkspaceId,
    workflowId,
    nodes,
    edges,
    zoom,
    pan,
    catalogTypeByKey,
    saveMutation,
    toast,
  ]);

  const handleValidate = React.useCallback(async () => {
    if (!workflowId) {
      toast({
        title: "Set a workflow id first",
        variant: "destructive",
      });
      return;
    }
    try {
      const result = await validateMutation.mutateAsync({
        workflowId,
        input: {
          nodes: nodes.map((n) => ({
            nodeKey: n.node_key,
            nodeType:
              catalogTypeByKey[n.node_key] ??
              (typeof n.config === "object" && n.config !== null
                ? ((n.config as Record<string, unknown>).__type__ as string | undefined)
                : undefined) ??
              n.node_type,
            category: n.node_type as NodeType,
            label: n.label,
            position: (n.position ?? { x: 0, y: 0 }) as { x: number; y: number },
            config: (n.config ?? {}) as Record<string, unknown>,
            isEnabled: n.is_enabled,
          })),
          edges: edges.map((e) => {
            const source = nodes.find((n) => n.id === e.source_node_id);
            const target = nodes.find((n) => n.id === e.target_node_id);
            return {
              sourceNodeKey: source?.node_key ?? "",
              targetNodeKey: target?.node_key ?? "",
            };
          }),
        },
      });
      setValidation(result);
      setActiveTab("config");
    } catch (err) {
      toast({
        title: "Validation failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [workflowId, nodes, edges, catalogTypeByKey, validateMutation, toast]);

  const handlePreview = React.useCallback(async () => {
    if (!workflowId) {
      toast({ title: "Set a workflow id first", variant: "destructive" });
      return;
    }
    try {
      const result = await previewMutation.mutateAsync({
        workflowId,
        input: {
          nodes: nodes.map((n) => ({
            nodeKey: n.node_key,
            nodeType:
              catalogTypeByKey[n.node_key] ??
              (typeof n.config === "object" && n.config !== null
                ? ((n.config as Record<string, unknown>).__type__ as string | undefined)
                : undefined) ??
              n.node_type,
            category: n.node_type as NodeType,
            label: n.label,
            position: (n.position ?? { x: 0, y: 0 }) as { x: number; y: number },
            config: (n.config ?? {}) as Record<string, unknown>,
            isEnabled: n.is_enabled,
          })),
          edges: edges.map((e) => {
            const source = nodes.find((n) => n.id === e.source_node_id);
            const target = nodes.find((n) => n.id === e.target_node_id);
            return {
              sourceNodeKey: source?.node_key ?? "",
              targetNodeKey: target?.node_key ?? "",
            };
          }),
        },
      });
      setPreview(result);
      setActiveTab("debug");
    } catch (err) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [workflowId, nodes, edges, catalogTypeByKey, previewMutation, toast]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b bg-background/95 p-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <WorkflowIcon className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Workflow Builder</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ws" className="text-[10px] uppercase text-muted-foreground">
            Workspace
          </Label>
          {workspacesQuery.isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <Select
              value={activeWorkspaceId ?? ""}
              onValueChange={setActiveWorkspaceId}
            >
              <SelectTrigger id="ws" className="h-8 w-48">
                <SelectValue placeholder="Pick workspace…" />
              </SelectTrigger>
              <SelectContent>
                {(workspacesQuery.data ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="wf" className="text-[10px] uppercase text-muted-foreground">
            Workflow ID
          </Label>
          <Input
            id="wf"
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            placeholder="my-workflow"
            className="h-8 w-44"
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!workflowId || validateMutation.isPending}
            onClick={handleValidate}
          >
            <CheckCircle2 className="mr-1.5 size-3.5" />
            Validate
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!workflowId || previewMutation.isPending}
            onClick={handlePreview}
          >
            <Play className="mr-1.5 size-3.5" />
            Preview
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!workflowId || !activeWorkspaceId || saveMutation.isPending}
            onClick={handleSave}
          >
            <Save className="mr-1.5 size-3.5" />
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Validation banner */}
      {validation && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-xs",
            validation.ok
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {validation.ok ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <TriangleAlert className="size-4" />
          )}
          <span>
            {validation.ok
              ? `Workflow is valid (${validation.issues.filter((i) => i.severity === "warning").length} warning(s)).`
              : `${validation.issues.filter((i) => i.severity === "error").length} error(s) found.`}
          </span>
          <ul className="ml-4 list-disc">
            {validation.issues.slice(0, 3).map((issue, i) => (
              <li key={i}>
                <span className="font-mono text-[10px]">[{issue.nodeKey}]</span>{" "}
                {issue.message}
              </li>
            ))}
            {validation.issues.length > 3 && (
              <li className="text-muted-foreground">
                +{validation.issues.length - 3} more…
              </li>
            )}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => setValidation(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Preview banner */}
      {preview && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-xs",
            preview.ok
              ? "bg-emerald-500/10 text-emerald-700"
              : "bg-amber-500/10 text-amber-700",
          )}
        >
          <Play className="size-4" />
          <span>
            Preview {preview.ok ? "completed" : "stopped"} — visited{" "}
            {preview.visited.length} node(s) in {preview.durationMs}ms.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs"
            onClick={() => setPreview(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Main 3-pane layout */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1">
          <NodePalette className="hidden sm:flex" />
          <div ref={canvasWrapperRef} className="flex min-w-0 flex-1 flex-col">
            <WorkflowCanvas
              nodes={nodes}
              edges={edges}
              selectedNodeKey={selectedNodeKey}
              zoom={zoom}
              pan={pan}
              onSelectNode={setSelectedNodeKey}
              onNodeMove={handleNodeMove}
              onPanChange={setPan}
              onZoomChange={setZoom}
            />
          </div>

          {/* Right sidebar with tab switcher */}
          <div className="hidden sm:flex flex-col">
            <div className="flex border-l">
              {RIGHT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2 text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                >
                  <tab.icon className="size-3.5" />
                  <span className="hidden lg:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1">
              {activeTab === "config" && (
                <ConfigPanel
                  node={selectedNode}
                  catalogType={
                    selectedNodeKey ? catalogTypeByKey[selectedNodeKey] : undefined
                  }
                  onConfigChange={handleConfigChange}
                  onLabelChange={handleLabelChange}
                  onToggleEnabled={handleToggleEnabled}
                  onDelete={handleDelete}
                />
              )}
              {activeTab === "debug" && (
                <DebugConsole
                  workspaceId={activeWorkspaceId}
                  workflowId={workflowId || null}
                />
              )}
              {activeTab === "comments" && (
                <CommentsPanel
                  workspaceId={activeWorkspaceId}
                  workflowId={workflowId || null}
                />
              )}
              {activeTab === "versions" && (
                <VersionManager
                  workspaceId={activeWorkspaceId}
                  workflowId={workflowId || null}
                  graph={graphQuery.data ?? null}
                />
              )}
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  );
}
