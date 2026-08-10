'use client';

import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  Zap,
  Clock,
  ExternalLink,
  AlertTriangle,
  Play,
  Box,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import type { ExecutionPreview } from '@/services/workflow-builder/types';

// ─── Props ──────────────────────────────────────────────

interface ExecutionPreviewPanelProps {
  nodes: Node[];
  edges: Edge[];
  onExecute?: () => void;
}

// ─── Cycle detection (DFS) ──────────────────────────────

function detectCycles(nodes: Node[], edges: Edge[]): boolean {
  const adj = new Map<string, Set<string>>();
  const nodeIds = new Set(nodes.map((n) => n.id));

  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, new Set());
    adj.get(edge.source)!.add(edge.target);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    stack.add(nodeId);
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (!nodeIds.has(neighbor)) continue;
      if (stack.has(neighbor)) return true;
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    stack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}

// ─── Compute preview ───────────────────────────────────

function computePreview(nodes: Node[], edges: Edge[]): ExecutionPreview {
  const warnings: string[] = [];
  let estimatedCredits = 0;
  let externalApiCalls = 0;
  let estimatedTimeMs = 0;
  const expectedOutputs: string[] = [];

  const hasCycle = detectCycles(nodes, edges);
  if (hasCycle) {
    warnings.push('Circular reference detected — execution may loop indefinitely.');
  }

  const edgeSourceIds = new Set(edges.map((e) => e.target));
  const edgeTargetIds = new Set(edges.map((e) => e.source));

  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const category = data?.nodeCategory as string | undefined;
    const config = (data?.config ?? {}) as Record<string, unknown>;

    switch (category) {
      case 'ai':
        estimatedCredits += 10;
        estimatedTimeMs += 2000;
        break;
      case 'integration':
      case 'data':
        externalApiCalls += 1;
        estimatedTimeMs += 500;
        break;
      case 'communication':
        externalApiCalls += 1;
        estimatedTimeMs += 800;
        break;
      default:
        estimatedTimeMs += 100;
        break;
    }

    // Check for missing required configs on AI nodes
    if (category === 'ai' && !config?.model && !config?.provider) {
      warnings.push(`Node "${data?.label ?? node.id}" (AI) is missing model/provider configuration.`);
    }

    // Collect potential outputs from nodes that produce data
    if (category === 'ai' || category === 'data' || category === 'integration') {
      expectedOutputs.push(`${data?.label ?? node.id}_output`);
    }
  }

  // Check for unconnected non-trigger nodes (no incoming edge)
  const triggerCategories = new Set(['trigger']);
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const cat = data?.nodeCategory as string | undefined;
    if (cat && !triggerCategories.has(cat) && !edgeSourceIds.has(node.id)) {
      warnings.push(`Node "${data?.label ?? node.id}" has no incoming connection.`);
    }
  }

  // Check for trigger nodes with no outgoing edges
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const cat = data?.nodeCategory as string | undefined;
    if (cat === 'trigger' && !edgeTargetIds.has(node.id) && nodes.length > 1) {
      warnings.push(`Trigger "${data?.label ?? node.id}" is not connected to any downstream node.`);
    }
  }

  return {
    estimatedTimeMs,
    estimatedCredits,
    externalApiCalls,
    expectedOutputs: expectedOutputs.slice(0, 5),
    riskWarnings: warnings,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
}

// ─── Component ──────────────────────────────────────────

export function ExecutionPreviewPanel({ nodes, edges, onExecute }: ExecutionPreviewPanelProps) {
  const preview = useMemo(() => computePreview(nodes, edges), [nodes, edges]);

  const hasRisks = preview.riskWarnings.length > 0;
  const hasCritical = preview.riskWarnings.some((w) =>
    w.toLowerCase().includes('circular'),
  );

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const secs = ms / 1000;
    if (secs < 60) return `~${secs.toFixed(1)}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = Math.round(secs % 60);
    return `~${mins}m ${remSecs}s`;
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Execution Preview
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Est. Time</span>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {formatDuration(preview.estimatedTimeMs)}
            </span>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Est. Credits</span>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {preview.estimatedCredits}
            </span>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">API Calls</span>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {preview.externalApiCalls}
            </span>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
              <Box className="h-3.5 w-3.5" />
              <span className="text-[11px] font-medium">Nodes</span>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {preview.nodeCount}
            </span>
          </div>
        </div>

        {/* Expected outputs */}
        {preview.expectedOutputs.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Expected Outputs</p>
            <div className="flex flex-wrap gap-1.5">
              {preview.expectedOutputs.map((output) => (
                <Badge key={output} variant="secondary" className="text-[10px] font-normal">
                  {output}
                </Badge>
              ))}
              {preview.expectedOutputs.length >= 5 && (
                <Badge variant="outline" className="text-[10px] font-normal">
                  +{preview.expectedOutputs.length - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/* Risk warnings */}
        {hasRisks ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Warnings ({preview.riskWarnings.length})
            </p>
            {preview.riskWarnings.map((warning, idx) => (
              <Alert
                key={idx}
                variant={warning.toLowerCase().includes('circular') ? 'destructive' : 'default'}
                className="py-2 px-3"
              >
                <AlertDescription className="text-xs">
                  {warning}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20 p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              No issues detected
            </p>
            <p className="text-[11px] text-emerald-600/70 dark:text-emerald-500/60 mt-0.5">
              {preview.nodeCount} nodes and {preview.edgeCount} connections look good.
            </p>
          </div>
        )}

        <Separator />

        {/* Execute button */}
        <Button
          className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={onExecute}
          disabled={hasCritical}
        >
          <Play className="h-4 w-4" />
          Execute Workflow
        </Button>
        {hasCritical && (
          <p className="text-[11px] text-destructive text-center -mt-2">
            Fix critical issues before executing.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
