"use client";

/**
 * Supa AI — Phase 9 Workspace document editor.
 *
 * A lightweight textarea-based markdown editor with a save button.
 * Saves are debounced via the parent's `useUpdateDocument` mutation;
 * the version-history panel updates automatically when a save lands.
 *
 * @module @/components/workspace/document-editor
 */
import * as React from "react";
import { FileText, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Document } from "@/lib/workspace/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

export interface DocumentEditorProps {
  document: Document | null;
  isLoading?: boolean;
  /** Called when the user clicks "Save" (or autosaves, future). */
  onSave?: (input: {
    title: string;
    content: string | null;
    status?: Document["status"];
  }) => void;
  /** True while a save is in-flight. */
  isSaving?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<Document["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function DocumentEditor({
  document,
  isLoading,
  onSave,
  isSaving,
  className,
}: DocumentEditorProps) {
  const [title, setTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  // Hydrate local state when the incoming `document` changes.
  React.useEffect(() => {
    if (!document) {
      setTitle("");
      setContent("");
      setDirty(false);
      return;
    }
    setTitle(document.title);
    setContent(document.content ?? "");
    setDirty(false);
  }, [document?.id, document?.title, document?.content]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <EmptyState
        icon={FileText}
        title="No document selected"
        description="Pick a document from the list, or create a new one to start writing."
        className={className}
      />
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <header className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="h-9 flex-1 border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            aria-label="Document title"
          />
          <Badge variant="outline" className="shrink-0 text-[10px]">
            v{document.version}
          </Badge>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {STATUS_LABEL[document.status]}
          </Badge>
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={!dirty || isSaving}
          onClick={() => {
            onSave?.({ title, content: content || null });
            setDirty(false);
          }}
        >
          <Save className="size-3.5" aria-hidden="true" />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </header>
      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDirty(true);
        }}
        placeholder="Start writing in markdown…"
        className="min-h-[60vh] flex-1 resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
        aria-label="Document content"
      />
    </div>
  );
}
