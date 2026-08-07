"use client";

/**
 * Supa AI — Phase 9B Builder — node palette.
 *
 * A searchable, category-grouped list of node definitions. Each item is
 * draggable via @dnd-kit — dragging onto the {@link WorkflowCanvas}
 * drops a new node at the cursor position.
 *
 * Reads `/api/builder/node-definitions` via {@link useNodeDefinitions}.
 *
 * @module @/components/builder/node-palette
 */
import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  NODE_CATEGORY_LABELS,
  NODE_CATEGORY_ORDER,
  type NodeDefinition,
  type NodeType,
} from "@/lib/builder/client";
import { useNodeDefinitions } from "@/hooks/use-builder";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

/** A single draggable node entry in the palette. */
function PaletteItem({ node }: { node: NodeDefinition }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${node.type}`,
    data: { kind: "palette-node", nodeType: node.type },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex cursor-grab flex-col gap-0.5 rounded-md border bg-card p-2 text-xs transition-colors hover:bg-accent",
        isDragging && "opacity-50",
      )}
      title={node.description}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          {node.icon}
        </span>
        <span className="font-medium">{node.label}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">{node.type}</span>
    </div>
  );
}

export interface NodePaletteProps {
  className?: string;
}

export function NodePalette({ className }: NodePaletteProps) {
  const { data: nodes, isLoading } = useNodeDefinitions();
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!nodes) return [];
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q) ||
        n.description.toLowerCase().includes(q),
    );
  }, [nodes, search]);

  const grouped = React.useMemo(() => {
    const map = new Map<NodeType, NodeDefinition[]>();
    for (const cat of NODE_CATEGORY_ORDER) map.set(cat, []);
    for (const node of filtered) {
      const arr = map.get(node.category);
      if (arr) arr.push(node);
    }
    return map;
  }, [filtered]);

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-2 border-r bg-background/40 sm:w-72",
        className,
      )}
      aria-label="Node palette"
    >
      <header className="flex flex-col gap-2 p-3">
        <h2 className="text-sm font-semibold">Node palette</h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="h-9 pl-8"
            aria-label="Search nodes"
          />
        </div>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-3 pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            NODE_CATEGORY_ORDER.map((cat) => {
              const items = grouped.get(cat) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={cat} className="space-y-1.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {NODE_CATEGORY_LABELS[cat]} ({items.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5">
                    {items.map((node) => (
                      <PaletteItem key={node.type} node={node} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No nodes match &ldquo;{search}&rdquo;.
            </p>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
