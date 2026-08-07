"use client";

/**
 * Supa AI — Phase 9B Builder — version manager.
 *
 * The Phase 9B builder doesn't have a dedicated `workflow_versions` table
 * yet (this Phase ships the canvas + service; versions land in a follow-
 * up). This panel therefore surfaces:
 *
 *   - The current workflow's `updated_at` (proxy for "last saved" time).
 *   - Export → download a portable JSON snapshot of the workflow.
 *   - Import → upload a previously exported JSON snapshot to clone the
 *     workflow into a new id (or overwrite the current one).
 *
 * The exported JSON is a {@link WorkflowExport} v1 payload — round-trip
 * safe through `BuilderService.importWorkflow`.
 *
 * @module @/components/builder/version-manager
 */
import * as React from "react";
import { Download, GitBranch, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkflowGraph } from "@/lib/builder/client";
import {
  useExportWorkflow,
  useImportWorkflow,
} from "@/hooks/use-builder";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

export interface VersionManagerProps {
  workspaceId: string | null;
  workflowId: string | null;
  /** The currently-loaded graph (for the "last saved" timestamp). */
  graph: WorkflowGraph | null | undefined;
  className?: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VersionManager({
  workspaceId,
  workflowId,
  graph,
  className,
}: VersionManagerProps) {
  const exportQuery = useExportWorkflow(workspaceId, workflowId);
  const importMutation = useImportWorkflow();
  const { toast } = useToast();

  const handleDownload = React.useCallback(() => {
    if (!exportQuery.data) return;
    const blob = new Blob([JSON.stringify(exportQuery.data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${workflowId ?? "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportQuery.data, workflowId]);

  const handleUpload = React.useCallback(() => {
    if (!workflowId || !workspaceId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await importMutation.mutateAsync({
          workflowId,
          workspaceId,
          input: payload,
        });
        toast({
          title: "Workflow imported",
          description: `Loaded ${payload.nodes?.length ?? 0} nodes.`,
        });
      } catch (err) {
        toast({
          title: "Import failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    };
    input.click();
  }, [workflowId, workspaceId, importMutation, toast]);

  return (
    <aside
      className={cn(
        "flex w-full flex-col border-l bg-background/40 sm:w-80",
        className,
      )}
      aria-label="Version manager"
    >
      <header className="flex items-center gap-2 p-3">
        <GitBranch className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Versions</h2>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3 pt-0 text-xs">
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">
              Last saved
            </p>
            <p className="font-medium">
              {graph?.nodes?.[0]?.updated_at
                ? formatTimestamp(graph.nodes[0].updated_at)
                : "Never"}
            </p>
          </div>
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">
              Node count
            </p>
            <p className="font-medium">{graph?.nodes?.length ?? 0}</p>
          </div>
          <div className="rounded-md border bg-card p-2">
            <p className="text-[10px] uppercase text-muted-foreground">
              Edge count
            </p>
            <p className="font-medium">{graph?.edges?.length ?? 0}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full justify-start text-xs"
              onClick={handleDownload}
              disabled={!exportQuery.data}
            >
              <Download className="mr-1.5 size-3.5" />
              Export workflow (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full justify-start text-xs"
              onClick={handleUpload}
              disabled={!workflowId || !workspaceId}
            >
              <Upload className="mr-1.5 size-3.5" />
              Import workflow (JSON)
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Exported snapshots are portable across workspaces — import them
            into any workflow id to clone the graph.
          </p>
        </div>
      </ScrollArea>
    </aside>
  );
}
