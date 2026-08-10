'use client';

import { memo } from 'react';
import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import {
  MousePointerClick,
  Clock,
  Globe,
  Plug,
  User,
  Users,
  Sparkles,
  Briefcase,
  MessageSquare,
  ImageIcon,
  Video,
  Mic,
  Languages,
  FileText,
  Tag,
  Database,
  ScanText,
  GitBranch,
  GitMerge,
  GitFork,
  Split,
  Repeat,
  Timer,
  LayoutGrid,
  OctagonX,
  Variable,
  Braces,
  ArrowRightLeft,
  AlignLeft,
  Calculator,
  RefreshCw,
  Filter,
  Bell,
  MessageCircle,
  Send,
  Hash,
  AtSign,
  Smartphone,
  Contact,
  UserPlus,
  Receipt as ReceiptIcon,
  FileCheck,
  CreditCard,
  Package,
  DollarSign,
  CheckSquare,
  Calendar,
  Brain,
  Bot,
  Cpu,
  Github,
  HardDrive,
  ShoppingBag,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { nodeRegistry, type NodeDefinition } from '@/services/workflow-builder';
import type { NodeCategory } from '@/types/generated/database';

// ─── Icon Map ──────────────────────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MousePointerClick,
  Clock,
  Globe,
  Plug,
  User,
  Users,
  Sparkles,
  Briefcase,
  MessageSquare,
  ImageIcon,
  Video,
  Mic,
  Languages,
  FileText,
  Tag,
  Database,
  ScanText,
  GitBranch,
  GitMerge,
  GitFork,
  Split,
  Repeat,
  Timer,
  LayoutGrid,
  OctagonX,
  Variable,
  Braces,
  ArrowRightLeft,
  AlignLeft,
  Calculator,
  RefreshCw,
  Filter,
  Bell,
  MessageCircle,
  Send,
  Hash,
  AtSign,
  Smartphone,
  Contact,
  UserPlus,
  ReceiptIcon,
  FileCheck,
  CreditCard,
  Package,
  DollarSign,
  CheckSquare,
  Calendar,
  Brain,
  Bot,
  Cpu,
  Github,
  HardDrive,
  ShoppingBag,
};

/** Module-level icon renderer – avoids creating component references during render. */
function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Comp = ICON_MAP[name] ?? Variable;
  return <Comp className={className} />;
}

// ─── Color Maps ───────────────────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  trigger: 'border-emerald-500 bg-emerald-500/10',
  ai: 'border-violet-500 bg-violet-500/10',
  logic: 'border-amber-500 bg-amber-500/10',
  data: 'border-sky-500 bg-sky-500/10',
  communication: 'border-rose-500 bg-rose-500/10',
  business: 'border-orange-500 bg-orange-500/10',
  integration: 'border-zinc-500 bg-zinc-500/10',
};

const CATEGORY_HEADER_COLORS: Record<string, string> = {
  trigger: 'bg-emerald-500',
  ai: 'bg-violet-500',
  logic: 'bg-amber-500',
  data: 'bg-sky-500',
  communication: 'bg-rose-500',
  business: 'bg-orange-500',
  integration: 'bg-zinc-500',
};

const CATEGORY_HANDLE_COLORS: Record<string, string> = {
  trigger: '!bg-emerald-500',
  ai: '!bg-violet-500',
  logic: '!bg-amber-500',
  data: '!bg-sky-500',
  communication: '!bg-rose-500',
  business: '!bg-orange-500',
  integration: '!bg-zinc-500',
};

// ─── Data Interface ──────────────────────────────────────────────────────────────────────────

export interface WorkflowNodeData {
  label: string;
  nodeCategory: NodeCategory;
  nodeType: string;
  icon: string;
  color: string;
  description?: string;
  isEnabled: boolean;
  hasBreakpoint: boolean;
  debugStatus?: 'idle' | 'running' | 'completed' | 'failed' | 'skipped';
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Shared Sub-components ────────────────────────────────────────────────────────────────────

/** Debug status indicator shown in the top-right of a node. */
function DebugStatusIndicator({ status }: { status?: WorkflowNodeData['debugStatus'] }) {
  if (!status || status === 'idle') return null;

  if (status === 'running') {
    return (
      <div className="absolute -top-1 -right-1 z-10">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="absolute -top-1 -right-1 z-10">
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-2 w-2 text-white" strokeWidth={3} />
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="absolute -top-1 -right-1 z-10">
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500">
          <X className="h-2 w-2 text-white" strokeWidth={3} />
        </div>
      </div>
    );
  }

  // skipped
  return (
    <div className="absolute -top-1 -right-1 z-10">
      <div className="h-3.5 w-3.5 rounded-full border-2 border-zinc-400 dark:border-zinc-500 bg-background" />
    </div>
  );
}

/** Red breakpoint dot shown in the top-left of a node. */
function BreakpointIndicator() {
  return (
    <div className="absolute -top-1 -left-1 z-10">
      <div className="h-3.5 w-3.5 rounded-full bg-red-500 ring-2 ring-red-500/30" />
    </div>
  );
}

/** Renders input/output handles from a node definition. */
function NodeHandles({
  definition,
  category,
}: {
  definition: NodeDefinition | undefined;
  category: string;
}) {
  const handleColor = CATEGORY_HANDLE_COLORS[category] ?? '!bg-zinc-400';

  return (
    <>
      {definition?.inputs.map((h) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          className={cn('!w-2.5 !h-2.5 !border-2 !border-background', handleColor)}
          aria-label={`Input: ${h.label}`}
        />
      ))}
      {definition?.outputs.map((h) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          className={cn('!w-2.5 !h-2.5 !border-2 !border-background', handleColor)}
          aria-label={`Output: ${h.label}`}
        />
      ))}
    </>
  );
}

// ─── WorkflowNode (main router) ──────────────────────────────────────────────────────────────

function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { nodeCategory, icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  const categoryClasses = CATEGORY_COLORS[nodeCategory] ?? CATEGORY_COLORS.integration;
  const headerColor = CATEGORY_HEADER_COLORS[nodeCategory] ?? CATEGORY_HEADER_COLORS.integration;

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 bg-background shadow-sm transition-all duration-150',
        categoryClasses,
        selected && 'ring-2 ring-ring ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`${label} node`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      {/* Colored header bar */}
      <div className={cn('flex h-7 items-center gap-1.5 rounded-t-[5px] px-2', headerColor)}>
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      {/* Body */}
      <div className="px-2 py-1.5">
        {nodeCategory === 'ai' && nodeData.config && (
          <span className="mb-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
            {(nodeData.config.model as string) || 'AI'}
          </span>
        )}
        {nodeCategory === 'logic' && nodeData.config && (nodeData.config.condition as string) && (
          <span className="mb-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            {String(nodeData.config.condition)}
          </span>
        )}
      </div>

      <NodeHandles definition={definition} category={nodeCategory} />
    </div>
  );
}

// ─── TriggerNode ──────────────────────────────────────────────────────────────────────────────

function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-2xl border border-emerald-300 bg-emerald-50 shadow-sm transition-all duration-150',
        'dark:border-emerald-700 dark:bg-emerald-950/40',
        selected && 'ring-2 ring-emerald-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Trigger: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-8 items-center gap-2 rounded-t-2xl bg-emerald-500 px-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
          <DynamicIcon name={icon} className="h-3 w-3 text-white" />
        </div>
        <span className="truncate text-xs font-semibold text-white">{label}</span>
      </div>

      <div className="px-3 py-1.5">
        <span className="inline-block rounded-full bg-emerald-200/60 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-200">
          Trigger
        </span>
      </div>

      {/* Only output handles for triggers */}
      {definition?.outputs.map((h) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          className="!w-2.5 !h-2.5 !border-2 !border-background !bg-emerald-500"
          aria-label={`Output: ${h.label}`}
        />
      ))}
    </div>
  );
}

// ─── AiNode ───────────────────────────────────────────────────────────────────────────────────

function AiNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType, config } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);
  const model = (config?.model as string) || '';
  const provider = (config?.provider as string) || '';

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-violet-500 bg-violet-50 shadow-sm transition-all duration-150',
        'dark:bg-violet-950/30',
        selected && 'ring-2 ring-violet-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`AI: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-violet-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      <div className="space-y-1 px-2 py-1.5">
        {(model || provider) && (
          <div className="flex flex-wrap gap-1">
            {provider && (
              <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {provider}
              </span>
            )}
            {model && (
              <span className="inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
                {model}
              </span>
            )}
          </div>
        )}
      </div>

      <NodeHandles definition={definition} category="ai" />
    </div>
  );
}

// ─── LogicNode ────────────────────────────────────────────────────────────────────────────────

function LogicNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType, config } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);
  const condition = config?.condition as string | undefined;

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-amber-500 bg-amber-50 shadow-sm transition-all duration-150',
        'dark:bg-amber-950/30',
        selected && 'ring-2 ring-amber-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Logic: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-amber-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      {condition && (
        <div className="px-2 py-1.5">
          <code className="block truncate rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            {condition}
          </code>
        </div>
      )}

      <NodeHandles definition={definition} category="logic" />
    </div>
  );
}

// ─── DataNode ─────────────────────────────────────────────────────────────────────────────────

function DataNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-sky-500 bg-sky-50 shadow-sm transition-all duration-150',
        'dark:bg-sky-950/30',
        selected && 'ring-2 ring-sky-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Data: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-sky-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      <div className="px-2 py-1.5">
        <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
          Data
        </span>
      </div>

      <NodeHandles definition={definition} category="data" />
    </div>
  );
}

// ─── CommunicationNode ────────────────────────────────────────────────────────────────────────

function CommunicationNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-rose-500 bg-rose-50 shadow-sm transition-all duration-150',
        'dark:bg-rose-950/30',
        selected && 'ring-2 ring-rose-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Communication: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-rose-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      <div className="px-2 py-1.5">
        <span className="inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
          Communication
        </span>
      </div>

      <NodeHandles definition={definition} category="communication" />
    </div>
  );
}

// ─── BusinessNode ─────────────────────────────────────────────────────────────────────────────

function BusinessNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-orange-500 bg-orange-50 shadow-sm transition-all duration-150',
        'dark:bg-orange-950/30',
        selected && 'ring-2 ring-orange-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Business: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-orange-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      <div className="px-2 py-1.5">
        <span className="inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/20 dark:text-orange-300">
          Business
        </span>
      </div>

      <NodeHandles definition={definition} category="business" />
    </div>
  );
}

// ─── IntegrationNode ──────────────────────────────────────────────────────────────────────────

function IntegrationNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const { icon, label, isEnabled, hasBreakpoint, debugStatus, nodeType } = nodeData;
  const definition = nodeRegistry.getByType(nodeType);

  return (
    <div
      className={cn(
        'relative min-h-[60px] w-[240px] rounded-lg border-l-4 border-zinc-500 bg-zinc-50 shadow-sm transition-all duration-150',
        'dark:bg-zinc-900/50',
        selected && 'ring-2 ring-zinc-500 ring-offset-1',
        !isEnabled && 'opacity-50',
      )}
      role="article"
      aria-label={`Integration: ${label}`}
    >
      {hasBreakpoint && <BreakpointIndicator />}
      <DebugStatusIndicator status={debugStatus} />

      <div className="flex h-7 items-center gap-1.5 rounded-t-[5px] bg-zinc-500 px-2">
        <DynamicIcon name={icon} className="h-3.5 w-3.5 shrink-0 text-white" />
        <span className="truncate text-xs font-medium text-white">{label}</span>
      </div>

      <div className="px-2 py-1.5">
        <span className="inline-block rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
          Integration
        </span>
      </div>

      <NodeHandles definition={definition} category="integration" />
    </div>
  );
}

// ─── Memoized Exports ─────────────────────────────────────────────────────────────────────────

export const MemoizedWorkflowNode = memo(WorkflowNode);
export const MemoizedTriggerNode = memo(TriggerNode);
export const MemoizedAiNode = memo(AiNode);
export const MemoizedLogicNode = memo(LogicNode);
export const MemoizedDataNode = memo(DataNode);
export const MemoizedCommunicationNode = memo(CommunicationNode);
export const MemoizedBusinessNode = memo(BusinessNode);
export const MemoizedIntegrationNode = memo(IntegrationNode);

// ─── nodeTypes Map for ReactFlow ─────────────────────────────────────────────────────────────

export const nodeTypes: Record<string, React.ComponentType<NodeProps>> = {
  workflow: MemoizedWorkflowNode,
};
