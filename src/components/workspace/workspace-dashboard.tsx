"use client";

/**
 * Supa AI — Phase 9 Workspace dashboard.
 *
 * Renders an aggregate overview for a single workspace: stat cards
 * (members, documents, folders, files, knowledge, comments, unread
 * mentions, storage used, AI credits), recent activity feed, and
 * recent documents list.
 *
 * Reads `/api/workspace/workspaces/:id/dashboard` via
 * {@link useWorkspaceDashboard}.
 *
 * @module @/components/workspace/workspace-dashboard
 */
import * as React from "react";
import {
  Activity,
  BookOpen,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  MessageSquare,
  Sparkles,
  Users,
  Bell,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useWorkspaceDashboard } from "@/hooks/use-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";

export interface WorkspaceDashboardProps {
  workspaceId: string;
  onOpenDocument?: (documentId: string) => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkspaceDashboard({
  workspaceId,
  onOpenDocument,
  className,
}: WorkspaceDashboardProps) {
  const query = useWorkspaceDashboard(workspaceId);

  if (query.isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        icon={Activity}
        title="Couldn't load dashboard"
        description={
          query.error instanceof Error
            ? query.error.message
            : "Please try again."
        }
        className={className}
      />
    );
  }

  const dashboard = query.data;

  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader
        title={dashboard.workspace.name}
        description={dashboard.workspace.description ?? undefined}
      />

      <section
        aria-label="Workspace stats"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        <StatCard
          icon={Users}
          label="Members"
          value={dashboard.memberCount}
        />
        <StatCard
          icon={FileText}
          label="Documents"
          value={dashboard.documentCount}
        />
        <StatCard
          icon={FolderIcon}
          label="Folders"
          value={dashboard.folderCount}
        />
        <StatCard
          icon={HardDrive}
          label="Files"
          value={dashboard.fileCount}
        />
        <StatCard
          icon={BookOpen}
          label="Knowledge"
          value={dashboard.knowledgeCount}
        />
        <StatCard
          icon={MessageSquare}
          label="Comments"
          value={dashboard.commentCount}
        />
        <StatCard
          icon={Bell}
          label="Unread mentions"
          value={dashboard.unreadMentionCount}
        />
        <StatCard
          icon={Sparkles}
          label="AI credits"
          value={dashboard.aiCreditsPool}
        />
      </section>

      <section aria-label="Storage">
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Storage used
        </h3>
        <div className="flex items-center gap-2 rounded-md border p-3">
          <HardDrive className="size-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {formatBytes(dashboard.storageUsedBytes)}
            </p>
            <p className="text-xs text-muted-foreground">
              across {dashboard.fileCount} file(s)
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label="Recent documents">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent documents
          </h3>
          {dashboard.recentDocuments.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No documents yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {dashboard.recentDocuments.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => onOpenDocument?.(d.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border p-2.5 text-left text-sm hover:bg-muted"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{d.title}</span>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatTimestamp(d.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent activity">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent activity
          </h3>
          {dashboard.recentActivity.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {dashboard.recentActivity.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-md border p-2.5 text-xs"
                >
                  <Activity
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.action}</p>
                    {a.resource_type ? (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        on {a.resource_type}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatTimestamp(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
