/**
 * Supa AI — Phase 9A Automation Zod schemas.
 *
 * Reusable validation rules for every Phase 9A automation surface:
 * workflow CRUD, triggers, actions, variables, templates, runs, and
 * webhooks. Infer types from these schemas so the runtime contract
 * and the TypeScript type can never drift apart.
 *
 * @module @/lib/validation/automation
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0011_phase9a_automation.sql)
// ---------------------------------------------------------------------------

export const workflowStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
  "draft",
]);

export const workflowTriggerTypeSchema = z.enum([
  "schedule",
  "event",
  "webhook",
  "manual",
  "api",
]);

export const workflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const workflowLogLevelSchema = z.enum([
  "debug",
  "info",
  "warn",
  "error",
]);

export const workflowVariableTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "json",
  "secret",
]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be at most 120 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(4000, "Description must be at most 4000 characters.");

const templateCategorySchema = z
  .string()
  .trim()
  .max(80, "Template category must be at most 80 characters.");

const actionTypeSchema = z
  .string()
  .trim()
  .min(1, "Action type is required.")
  .max(80, "Action type must be at most 80 characters.")
  .regex(
    /^[a-z0-9_]+$/,
    "Action type must be lowercase snake_case (e.g. send_email).",
  );

const variableKeySchema = z
  .string()
  .trim()
  .min(1, "Variable key is required.")
  .max(120, "Variable key must be at most 120 characters.")
  .regex(
    /^[a-zA-Z_][a-zA-Z0-9_.$-]*$/,
    "Variable key must start with a letter/underscore and may contain letters, digits, _, ., $, -.",
  );

const urlSlugSchema = z
  .string()
  .trim()
  .min(3, "URL slug must be at least 3 characters.")
  .max(120, "URL slug must be at most 120 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "URL slug must be lowercase alphanumeric, separated by single hyphens.",
  );

const jsonValueSchema = z.unknown();
const configSchema = z.record(z.string(), jsonValueSchema);

// ---------------------------------------------------------------------------
// Workflow CRUD
// ---------------------------------------------------------------------------

export const createWorkflowSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.nullable().optional(),
    status: workflowStatusSchema.optional(),
    isTemplate: z.boolean().optional(),
    templateCategory: templateCategorySchema.nullable().optional(),
    config: configSchema.optional(),
  })
  .strict();

export const updateWorkflowSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    status: workflowStatusSchema.optional(),
    isTemplate: z.boolean().optional(),
    templateCategory: templateCategorySchema.nullable().optional(),
    config: configSchema.optional(),
  })
  .strict();

export const listWorkflowsQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    status: workflowStatusSchema.optional(),
    isTemplate: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    templateCategory: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export const createTriggerSchema = z
  .object({
    type: workflowTriggerTypeSchema,
    config: configSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const createActionSchema = z
  .object({
    type: actionTypeSchema,
    name: nameSchema,
    config: configSchema.optional(),
    order: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export const createVariableSchema = z
  .object({
    key: variableKeySchema,
    value: z.string().max(16000).nullable().optional(),
    type: workflowVariableTypeSchema.optional(),
    isSecret: z.boolean().optional(),
  })
  .strict();

export const updateVariableSchema = z
  .object({
    value: z.string().max(16000).nullable().optional(),
    type: workflowVariableTypeSchema.optional(),
    isSecret: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const createTemplateSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.nullable().optional(),
    category: z.string().trim().max(80).optional(),
    config: configSchema.optional(),
    isFeatured: z.boolean().optional(),
  })
  .strict();

export const listTemplatesQuerySchema = z
  .object({
    category: z.string().trim().max(80).optional(),
    search: z.string().trim().max(200).optional(),
    featured: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export const listRunsQuerySchema = z
  .object({
    status: workflowRunStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const listLogsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const createWebhookSchema = z
  .object({
    name: nameSchema.optional(),
  })
  .strict();

export const webhookUrlSlugSchema = urlSlugSchema;

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuerySchema>;
export type CreateTriggerInput = z.infer<typeof createTriggerSchema>;
export type CreateActionInput = z.infer<typeof createActionSchema>;
export type CreateVariableInput = z.infer<typeof createVariableSchema>;
export type UpdateVariableInput = z.infer<typeof updateVariableSchema>;
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
