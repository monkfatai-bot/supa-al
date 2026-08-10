"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronRight, FolderPlus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getFolderTree, createFolder } from "@/services/folder";
import type { FolderTreeItem } from "@/services/folder";

interface FolderTreeProps {
  workspaceId: string;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string | null) => void;
}

function FolderNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: FolderTreeItem;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
            selectedId === node.id && "bg-accent font-medium",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(node.id);
          }}
        >
          {hasChildren ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform data-[state=open]:rotate-90" />
          ) : (
            <span className="w-3.5" />
          )}
          <FolderOpen
            className="h-4 w-4 shrink-0"
            style={{ color: node.color || undefined }}
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {node.document_count > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs px-1.5 py-0">
              {node.document_count}
            </Badge>
          )}
        </button>
      </CollapsibleTrigger>
      {hasChildren && (
        <CollapsibleContent>
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function FolderTree({ workspaceId, selectedFolderId, onFolderSelect }: FolderTreeProps) {
  const [tree, setTree] = useState<FolderTreeItem[]>([]);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const fetchTree = useCallback(() => {
    getFolderTree(workspaceId).then((res) => {
      if (res.success && res.tree) {
        setTree(res.tree);
      }
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    setIsCreating(true);
    const parentId = selectedFolderId;
    createFolder(workspaceId, newFolderName.trim(), parentId ?? undefined).then((res) => {
      if (res.success) {
        setNewFolderName("");
        setShowNewInput(false);
        fetchTree();
      }
      setIsCreating(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-sm font-semibold">Folders</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowNewInput(!showNewInput)}
        >
          <FolderPlus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {showNewInput && (
        <div className="flex items-center gap-2 px-2">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") {
                setShowNewInput(false);
                setNewFolderName("");
              }
            }}
            autoFocus
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleCreateFolder}
            disabled={isCreating || !newFolderName.trim()}
          >
            Add
          </Button>
        </div>
      )}

      <ScrollArea className="max-h-96">
        <div className="space-y-0.5 px-1">
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors",
              selectedFolderId === null && "bg-accent font-medium",
            )}
            onClick={() => onFolderSelect(null)}
          >
            <FolderOpen className="h-4 w-4" />
            <span>All Documents</span>
          </button>
          {tree.map((node) => (
            <FolderNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedFolderId}
              onSelect={onFolderSelect}
            />
          ))}
          {tree.length === 0 && (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              No folders yet. Create one to organize documents.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
