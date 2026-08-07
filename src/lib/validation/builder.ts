/**
 * Supa AI — Phase 9B Builder Zod schemas.
 *
 * Reusable validation rules for every Phase 9B builder surface: workflow
 * save / load, node + edge granular inserts, layout upsert, comments,
 * presence, debug sessions, and export / import. Infer types from these
 * schemas so the runtime contract and the TypeScript type can never
 * drift apart.
 *
 * @module @/lib/validation/builder
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0012_phase9b_builder.sql)
// ---------------------------------------------------------------------------

export const nodeTypeSchema = z.enum([
  "trigger",
  "action",
  "condition",
  "transform",
  "ai",
  "integration",
  "output",
]);

export const debugStatusSchema = z.enum([
  "idle",
  "running",
  "paused",
  "completed",
]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const workflowIdSchema = z
  .string()
  .trim()
  .min(1, "workflowId is required.")
  .max(200, "workflowId must be at most 200 characters.");

const workspaceIdSchema = z
  .string()
  .trim()
  .min(1, "workspaceId is required.")
  .max(200);

const nodeKeySchema = z
  .string()
  .trim()
  .min(1, "nodeKey is required.")
  .max(120, "nodeKey must be at most 120 characters.")
  .regex(
    /^[a-zA-Z0-9_\-]+$/,
    "nodeKey must be alphanumeric + dashes/underscores (e.g. trigger_1).",
  );

const labelSchema = z
  .string()
  .trim()
  .max(200, "Label must be at most 200 characters.");

const pointSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

const viewportSchema = z
  .object({
    zoom: z.number(),
    x: z.number(),
    y: z.number(),
  })
  .strict();

const jsonValueSchema = z.unknown();

const configSchema = z.record(z.string(), jsonValueSchema);

const portSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_\-]+$/)
  .default("out");

// ---------------------------------------------------------------------------
// Save / load
// ---------------------------------------------------------------------------

export const nodeInputSchema = z
  .object({
    nodeKey: nodeKeySchema,
    nodeType: z.string().trim().min(1).max(80),
    category: nodeTypeSchema,
    label: labelSchema.default(""),
    position: pointSchema,
    config: configSchema.default({}),
    isEnabled: z.boolean().optional(),
  })
  .strict();

export const edgeInputSchema = z
  .object({
    sourceNodeKey: nodeKeySchema,
    targetNodeKey: nodeKeySchema,
    sourcePort: portSchema.optional(),
    targetPort: portSchema.optional(),
    label: labelSchema.optional(),
    condition: configSchema.optional(),
  })
  .strict();

export const layoutInputSchema = z
  .object({
    viewport: viewportSchema,
    meta: configSchema.optional(),
  })
  .strict();

export const saveWorkflowSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    workflowId: workflowIdSchema,
    nodes: z.array(nodeInputSchema).max(500, "Too many nodes (max 500)."),
    edges: z.array(edgeInputSchema).max(1000, "Too many edges (max 1000)."),
    layout: layoutInputSchema.nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Granular node / edge / layout routes
// ---------------------------------------------------------------------------

export const addNodesSchema = z
  .object({
    nodes: z.array(nodeInputSchema).min(1).max(500),
  })
  .strict();

export const addEdgesSchema = z
  .object({
    edges: z
      .array(
        z
          .object({
            sourceNodeId: z.string().trim().min(1).max(120),
            targetNodeId: z.string().trim().min(1).max(120),
            sourcePort: portSchema.optional(),
            targetPort: portSchema.optional(),
            label: labelSchema.optional(),
            condition: configSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();

export const saveLayoutSchema = z
  .object({
    viewport: viewportSchema,
    meta: configSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Preview / validate
// ---------------------------------------------------------------------------

export const previewSchema = z
  .object({
    nodes: z.array(nodeInputSchema).max(500),
    edges: z.array(edgeInputSchema).max(1000),
    initialVariables: configSchema.optional(),
  })
  .strict();

export const validateSchema = z
  .object({
    nodes: z.array(nodeInputSchema).max(500),
    edges: z.array(edgeInputSchema).max(1000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

export const debugActionSchema = z.enum(["start", "pause", "resume", "stop"]);

export const debugMutationSchema = z
  .object({
    action: debugActionSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const createCommentSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    workflowId: workflowIdSchema,
    body: z
      .string()
      .trim()
      .min(1, "Comment body is required.")
      .max(16000, "Comment body must be at most 16000 characters."),
    position: pointSchema.optional(),
  })
  .strict();

export const updateCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(16000).optional(),
    position: pointSchema.optional(),
    resolved: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export const upsertPresenceSchema = z
  .object({
    workflowId: workflowIdSchema,
    cursor: pointSchema.optional(),
    selectedNodes: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export const exportNodeSchema = z
  .object({
    nodeKey: nodeKeySchema,
    nodeType: z.string().trim().min(1).max(80),
    category: nodeTypeSchema,
    label: labelSchema,
    position: pointSchema,
    config: configSchema,
    isEnabled: z.boolean(),
  })
  .strict();

export const exportEdgeSchema = z
  .object({
    sourceNodeKey: nodeKeySchema,
    targetNodeKey: nodeKeySchema,
    sourcePort: z.string().trim().min(1).max(40),
    targetPort: z.string().trim().min(1).max(40),
    label: z.string().max(200),
    condition: configSchema,
  })
  .strict();

export const exportLayoutSchema = z
  .object({
    viewport: viewportSchema,
    meta: configSchema.optional(),
  })
  .strict()
  .nullable();

export const importWorkflowSchema = z
  .object({
    version: z.literal(1),
    workflowId: workflowIdSchema,
    exportedAt: z.string().trim().min(1),
    nodes: z.array(exportNodeSchema).max(500),
    edges: z.array(exportEdgeSchema).max(1000),
    layout: exportLayoutSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Infer types
// ---------------------------------------------------------------------------

export type SaveWorkflowInput = z.infer<typeof saveWorkflowSchema>;
export type NodeInput = z.infer<typeof nodeInputSchema>;
export type EdgeInput = z.infer<typeof edgeInputSchema>;
export type LayoutInput = z.infer<typeof layoutInputSchema>;
export type AddNodesInput = z.infer<typeof addNodesSchema>;
export type AddEdgesInput = z.infer<typeof addEdgesSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutSchema>;
export type PreviewInput = z.infer<typeof previewSchema>;
export type ValidateInput = z.infer<typeof validateSchema>;
export type DebugMutationInput = z.infer<typeof debugMutationSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type UpsertPresenceInput = z.infer<typeof upsertPresenceSchema>;
export type ImportWorkflowInput = z.infer<typeof importWorkflowSchema>;
