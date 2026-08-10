'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  History,
  RotateCcw,
  Eye,
  Loader2,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  getWorkflowVersions,
  restoreWorkflowVersion,
  type WorkflowVersionWithAuthor,
} from '@/services/workflow-builder/actions';

// ─── Props ──────────────────────────────────────────────

interface VersionHistoryPanelProps {
  workflowId: string;
  onClose?: () => void;
  onRestore?: (versionId: string) => void;
  onSelect?: (versionId: string) => void;
  currentVersionNumber?: number;
}

// ─── Helpers ────────────────────────────────────────────

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ─── VersionHistoryPanel ────────────────────────────────

export function VersionHistoryPanel({
  workflowId,
  onClose,
  onRestore,
  onSelect,
  currentVersionNumber,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<WorkflowVersionWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // ─── Fetch versions ───────────────────────────────────
  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWorkflowVersions(workflowId);
      setVersions(data);
    } catch {
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  // ─── Restore handler ──────────────────────────────────
  const handleRestore = useCallback(async (versionId: string, versionNumber: number) => {
    setRestoringId(versionId);
    try {
      const result = await restoreWorkflowVersion(workflowId, versionId);
      if (result.success) {
        toast.success(`Restored to version ${versionNumber}`);
        onRestore?.(versionId);
        onClose?.();
      } else {
        toast.error('Restore failed', { description: result.error });
      }
    } catch {
      toast.error('Restore failed', { description: 'An unexpected error occurred.' });
    } finally {
      setRestoringId(null);
    }
  }, [workflowId, onRestore, onClose]);

  // ─── Empty state ──────────────────────────────────────
  if (!loading && versions.length === 0) {
    return (
      <Card className="h-full border-0 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </CardTitle>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <GitBranch className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No versions published yet</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Publish your workflow to create a version snapshot.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Main render ──────────────────────────────────────
  return (
    <Card className="h-full border-0 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4" />
            Version History
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {versions.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchVersions}
              disabled={loading}
            >
              <Loader2 className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-[calc(100vh-12rem)] max-h-96">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-3 w-32" />
                  <Separator className="my-2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {versions.map((version, idx) => {
                const isCurrent = version.version_number === currentVersionNumber;
                const isLatest = idx === 0;
                return (
                  <div key={version.id}>
                    <div
                      className={`group relative rounded-lg p-3 transition-colors ${
                        isCurrent
                          ? 'bg-primary/5 border border-primary/20'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      {/* Header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums">
                            v{version.version_number}
                          </span>
                          {isCurrent && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            >
                              Current
                            </Badge>
                          )}
                          {isLatest && !isCurrent && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4"
                            >
                              Latest
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeDate(version.created_at)}
                        </span>
                      </div>

                      {/* Author and summary */}
                      <p className="text-xs text-muted-foreground mt-1.5 truncate">
                        {version.author?.full_name ?? 'Unknown user'}
                      </p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5 truncate">
                        {version.change_summary || 'No description'}
                      </p>

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[11px] text-muted-foreground/60">
                          {version.node_count} node{version.node_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">
                          {version.edge_count} edge{version.edge_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Action buttons */}
                      {!isCurrent && (
                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {onSelect && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => onSelect(version.id)}
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            onClick={() => handleRestore(version.id, version.version_number)}
                            disabled={restoringId === version.id}
                          >
                            {restoringId === version.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Restore
                          </Button>
                        </div>
                      )}
                    </div>
                    {idx < versions.length - 1 && (
                      <Separator className="my-1" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
