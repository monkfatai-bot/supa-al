"use client";

/**
 * Supa AI — Phase 9 Workspace global search modal.
 *
 * Triggered by a search button in the workspace view header. Calls
 * `/api/workspace/search?q=…&workspaceId=…` via {@link useWorkspaceSearch}
 * (debounced 200ms). Renders grouped results (Documents / Knowledge /
 * Files / Folders) and emits `onSelect` with the chosen result kind +
 * id so the parent can navigate.
 *
 * @module @/components/workspace/workspace-search
 */
import * as React from "react";
import {
  FileText,
  Folder as FolderIcon,
  Search,
  Sparkles,
  File as FileIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaceSearch } from "@/hooks/use-workspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface WorkspaceSearchProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks a result. */
  onSelect?: (kind: "document" | "knowledge" | "file" | "folder", id: string) => void;
}

type Kind = "documents" | "knowledge" | "files" | "folders";

const KIND_META: Record<Kind, { label: string; icon: typeof FileText }> = {
  documents: { label: "Documents", icon: FileText },
  knowledge: { label: "Knowledge", icon: Sparkles },
  files: { label: "Files", icon: FileIcon },
  folders: { label: "Folders", icon: FolderIcon },
};

export function WorkspaceSearch({
  workspaceId,
  open,
  onOpenChange,
  onSelect,
}: WorkspaceSearchProps) {
  const [query, setQuery] = React.useState("");
  const debounced = React.useDeferredValue(query);

  const search = useWorkspaceSearch(workspaceId, {
    query: debounced,
    limit: 8,
  });

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = search.data;
  const isEmpty =
    results &&
    results.documents.length === 0 &&
    results.knowledge.length === 0 &&
    results.files.length === 0 &&
    results.folders.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="sr-only">Search workspace</DialogTitle>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              placeholder="Search documents, knowledge, files, folders…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-none pl-9 shadow-none focus-visible:ring-0"
              aria-label="Search workspace"
            />
          </div>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {search.isLoading && debounced.length > 0 ? (
            <div className="space-y-1.5 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isEmpty ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No results for &quot;{debounced}&quot;.
            </p>
          ) : (
            (Object.keys(KIND_META) as Kind[]).map((kind) => {
              const items = results?.[kind] ?? [];
              if (items.length === 0) return null;
              const Icon = KIND_META[kind].icon;
              return (
                <section key={kind} className="mb-2">
                  <h3 className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {KIND_META[kind].label}
                  </h3>
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const kindSingular =
                              kind === "documents"
                                ? "document"
                                : kind === "knowledge"
                                  ? "knowledge"
                                  : kind === "files"
                                    ? "file"
                                    : "folder";
                            onSelect?.(
                              kindSingular as
                                | "document"
                                | "knowledge"
                                | "file"
                                | "folder",
                              item.id,
                            );
                            onOpenChange(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                          )}
                        >
                          <Icon
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {(item as { title?: string; name?: string; file_name?: string }).title ??
                              (item as { name?: string }).name ??
                              (item as { file_name?: string }).file_name ??
                              item.id}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
