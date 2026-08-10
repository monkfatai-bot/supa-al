/**
 * @module workflow-builder
 * @description Barrel export for the Visual Workflow Builder service.
 *
 * Import everything from this module:
 *
 * ```ts
 * import {
 *   type NodeDefinition,
 *   type ValidationError,
 *   nodeRegistry,
 *   validateWorkflow,
 *   DEFAULT_SHORTCUTS,
 * } from '@/services/workflow-builder';
 * ```
 */

// ─── Types ────────────────────────────────────────────────

export type {
  NodeHandleConfig,
  NodeFieldDefinition,
  NodeDefinition,
  CanvasViewport,
  PanelState,
  ValidationError,
  DebugState,
  DebugTimelineEntry,
  ExecutionPreview,
  WorkflowCommentWithAuthor,
  ActivityFeedEntry,
  HistoryEntry,
  KeyboardShortcuts,
} from './types';

export { DEFAULT_SHORTCUTS } from './types';

// ─── Node Registry ────────────────────────────────────────

export { nodeRegistry } from './node-registry';
export type { CategoryMetadata } from './node-registry';

// ─── Validator ────────────────────────────────────────────

export { validateWorkflow } from './validator';
