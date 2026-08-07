"use client";

/**
 * Supa AI — Phase 9 Workspace folder tree.
 *
 * Presentational collapsible tree of workspace folders. The parent
 * passes a flat list of folders (from `/api/workspace/workspaces/:id/folders`);
 * this component builds the parent→children map in-memory and renders
 * an indented tree with expand/collapse toggles.
 *
 * Selecting a folder emits `onSelect(folder.id)`; the parent owns the
 * active-folder state and filters the document list accordingly.
 *
 * @module @/components/workspace/folder-tree
 */
import * as React from "react";
import { ChevronRight, Folder as FolderIcon, FolderPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Folder } from "@/lib/workspace/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface FolderTreeProps {
  folders: Folder[];
  activeFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onCreateFolder?: (parentId?: string | null) => void;
  isLoading?: boolean;
  className?: string;
}

interface TreeNode {
  folder: Folder;
  children: TreeNode[];
}

/** Build a tree from a flat list of folders (parent_id → children). */
function buildTree(folders: Folder[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const folder of folders) {
    byId.set(folder.id, { folder, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const folder of folders) {
    const node = byId.get(folder.id)!;
    if (folder.parent_id && byId.has(folder.parent_id)) {
      byId.get(folder.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function TreeNodeRow({
  node,
  depth,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
}: {
  node: TreeNode;
  depth: number;
  activeFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onCreateFolder?: (parentId?: string | null) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = activeFolderId === node.folder.id;

  return (
    <li role="treeitem" aria-expanded={open} aria-selected={isActive}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm",
          isActive
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-foreground/80",
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        <button
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded transition-transform",
            open ? "rotate-90" : "rotate-0",
            hasChildren ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onSelectFolder?.(node.folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <FolderIcon
            className="size-4 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <span className="truncate">{node.folder.name}</span>
        </button>
        <button
          type="button"
          aria-label="New subfolder"
          onClick={(e) => {
            e.stopPropagation();
            onCreateFolder?.(node.folder.id);
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted"
        >
          <FolderPlus className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {open && hasChildren ? (
        <ul role="group" className="mt-0.5">
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.folder.id}
              node={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onSelectFolder={onSelectFolder}
              onCreateFolder={onCreateFolder}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FolderTree({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  isLoading,
  className,
}: FolderTreeProps) {
  const tree = React.useMemo(() => buildTree(folders), [folders]);

  if (isLoading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between px-1.5 py-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Folders
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => onCreateFolder?.(null)}
        >
          <FolderPlus className="size-3.5" aria-hidden="true" />
          New
        </Button>
      </div>
      <button
        type="button"
        onClick={() => onSelectFolder?.(null)}
        className={cn(
          "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
          activeFolderId === null || activeFolderId === undefined
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-foreground/80",
        )}
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>All documents</span>
      </button>
      {tree.length === 0 ? (
        <p className="px-1.5 py-2 text-xs text-muted-foreground">
          No folders yet.
        </p>
      ) : (
        <ul role="tree" className="space-y-0.5">
          {tree.map((node) => (
            <TreeNodeRow
              key={node.folder.id}
              node={node}
              depth={0}
              activeFolderId={activeFolderId}
              onSelectFolder={onSelectFolder}
              onCreateFolder={onCreateFolder}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
