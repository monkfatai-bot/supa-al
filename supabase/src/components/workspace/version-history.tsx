"use client";

/**
 * Supa AI — Phase 9 Workspace document version history panel.
 *
 * Reads `/api/workspace/workspaces/:id/documents/:docId/versions` via
 * {@link useDocumentVersions}. Renders a scrollable timeline of
 * version snapshots (version number, changed-by, timestamp) with a
 * "View" button per row (opens the snapshot content in a dialog).
 *
 * @module @/components/workspace/version-history
 */
import * as React from "react";
import { GitCommit, History } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DocumentVersion } from "@/lib/workspace/client";
import { useDocumentVersions } from "@/hooks/use-workspace";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export interface VersionHistoryProps {
  workspaceId: string | null;
  documentId: string | null;
  className?: string;
}

/** Format an ISO timestamp as a relative + absolute string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionHistory({
  workspaceId,
  documentId,
  className,
}: VersionHistoryProps) {
  const query = useDocumentVersions(workspaceId, documentId);
  const [activeVersion, setActiveVersion] = React.useState<DocumentVersion | null>(null);

  return (
    <aside
      className={cn(
        "flex w-full flex-col gap-2 border-l bg-background/40 p-3 sm:w-80",
        className,
      )}
      aria-label="Version history"
    >
      <header className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Version history</h2>
      </header>
      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <EmptyState
          icon={History}
          title="Couldn't load history"
          description={
            query.error instanceof Error
              ? query.error.message
              : "Please try again."
          }
        />
      ) : query.data && query.data.length > 0 ? (
        <ol className="space-y-1.5 overflow-y-auto">
          {query.data.map((version) => (
            <li
              key={version.id}
              className="flex items-start gap-2 rounded-md border bg-background p-2 text-xs"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600">
                <GitCommit className="size-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-medium">v{version.version}</span>
                  <span className="text-muted-foreground">
                    {formatTimestamp(version.changed_at)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  by {version.changed_by?.slice(0, 8) ?? "unknown"}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => setActiveVersion(version)}
              >
                View
              </Button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={History}
          title="No version history yet"
          description="Save the document to create the first version snapshot."
        />
      )}

      <Dialog
        open={activeVersion !== null}
        onOpenChange={(open) => !open && setActiveVersion(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Version {activeVersion ? `v${activeVersion.version}` : ""}
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs">
            {activeVersion?.content ?? "(empty document)"}
          </pre>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
