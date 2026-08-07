/**
 * Supa AI — Phase 9C Employees Zod schemas.
 *
 * Reusable validation rules for every Phase 9C employee surface:
 * employee CRUD, skills, memory, training, assignments, performance,
 * marketplace, versions, collaboration messages, and chat. Infer types
 * from these schemas so the runtime contract and the TypeScript type
 * can never drift apart.
 *
 * @module @/lib/validation/employees
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0014_phase9c_employees.sql)
// ---------------------------------------------------------------------------

export const employeeStatusSchema = z.enum([
  "active",
  "paused",
  "archived",
  "training",
  "busy",
]);

export const experienceLevelSchema = z.enum([
  "junior",
  "mid",
  "senior",
  "expert",
]);

export const memoryTypeSchema = z.enum([
  "long-term",
  "session",
  "workspace",
  "user-preference",
  "task-history",
  "knowledge-ref",
  "learning",
]);

export const trainingSourceTypeSchema = z.enum([
  "document",
  "pdf",
  "docx",
  "txt",
  "markdown",
  "csv",
  "json",
  "website",
  "knowledge-base",
  "conversation",
]);

export const trainingStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const employeeMessageTypeSchema = z.enum([
  "message",
  "task-delegation",
  "escalation",
  "handoff",
  "context-share",
]);

export const marketplaceRatingSchema = z
  .number()
  .int("Rating must be an integer.")
  .min(1, "Rating must be at least 1.")
  .max(5, "Rating must be at most 5.") as z.ZodType<1 | 2 | 3 | 4 | 5>;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be at most 120 characters.");

const roleSchema = z
  .string()
  .trim()
  .min(1, "Role is required.")
  .max(120, "Role must be at most 120 characters.");

const departmentSchema = z
  .string()
  .trim()
  .min(1, "Department is required.")
  .max(80, "Department must be at most 80 characters.");

const descriptionSchema = z
  .string()
  .trim()
  .max(4000, "Description must be at most 4000 characters.");

const systemPromptSchema = z
  .string()
  .trim()
  .max(16000, "System prompt must be at most 16000 characters.");

const skillNameSchema = z
  .string()
  .trim()
  .min(1, "Skill name is required.")
  .max(80, "Skill name must be at most 80 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Skill name must be lowercase kebab-case (e.g. content-writing).",
  );

const proficiencySchema = z
  .number()
  .int()
  .min(0, "Proficiency must be at least 0.")
  .max(100, "Proficiency must be at most 100.");

const importanceSchema = z
  .number()
  .int()
  .min(0, "Importance must be at least 0.")
  .max(100, "Importance must be at most 100.");

const memoryKeySchema = z
  .string()
  .trim()
  .min(1, "Memory key is required.")
  .max(200, "Memory key must be at most 200 characters.");

const urlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .url("Please provide a valid URL.")
  .refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://");

const stringArraySchema = z.array(z.string().trim().min(1).max(120)).max(50);

const jsonValueSchema = z.unknown();

const metadataSchema = z.record(z.string(), jsonValueSchema).nullable();

// ---------------------------------------------------------------------------
// Employee CRUD
// ---------------------------------------------------------------------------

export const createEmployeeSchema = z
  .object({
    name: nameSchema,
    role: roleSchema,
    department: departmentSchema.optional(),
    description: descriptionSchema.optional().nullable(),
    avatarUrl: z.string().url().nullable().optional(),
    experienceLevel: experienceLevelSchema.optional(),
    systemPrompt: systemPromptSchema.optional().nullable(),
    permissions: stringArraySchema.optional(),
    tools: stringArraySchema.optional(),
    isTemplate: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const updateEmployeeSchema = z
  .object({
    name: nameSchema.optional(),
    role: roleSchema.optional(),
    department: departmentSchema.optional(),
    description: descriptionSchema.optional().nullable(),
    avatarUrl: z.string().url().nullable().optional(),
    status: employeeStatusSchema.optional(),
    experienceLevel: experienceLevelSchema.optional(),
    systemPrompt: systemPromptSchema.optional().nullable(),
    permissions: stringArraySchema.optional(),
    tools: stringArraySchema.optional(),
    isTemplate: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const listEmployeesQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    department: z.string().trim().max(80).optional(),
    status: employeeStatusSchema.optional(),
    isTemplate: z.enum(["true", "false"]).transform(v => v === "true").optional(),
    isPublic: z.enum(["true", "false"]).transform(v => v === "true").optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export const addSkillSchema = z
  .object({
    skillName: skillNameSchema,
    proficiency: proficiencySchema.optional(),
    isPrimary: z.boolean().optional(),
    config: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();

export const updateSkillSchema = z
  .object({
    proficiency: proficiencySchema.optional(),
    isPrimary: z.boolean().optional(),
    config: z.record(z.string(), jsonValueSchema).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const addMemorySchema = z
  .object({
    memoryType: memoryTypeSchema,
    key: memoryKeySchema,
    value: jsonValueSchema,
    importance: importanceSchema.optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const updateMemorySchema = z
  .object({
    memoryType: memoryTypeSchema.optional(),
    key: memoryKeySchema.optional(),
    value: jsonValueSchema.optional(),
    importance: importanceSchema.optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const listMemoryQuerySchema = z
  .object({
    type: memoryTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const searchMemoryQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const trainFromUrlSchema = z
  .object({
    url: urlSchema,
    title: z.string().trim().max(200).optional(),
  })
  .strict();

export const trainFromDocumentSchema = z
  .object({
    documentId: z.string().trim().min(1).max(120),
    title: z.string().trim().max(200).optional(),
    content: z.string().trim().min(1).max(500_000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export const assignToWorkspaceSchema = z
  .object({
    workspaceId: z.string().trim().min(1).max(120),
    roleOverride: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

export const performanceQuerySchema = z
  .object({
    dateFrom: z.string().trim().optional(),
    dateTo: z.string().trim().optional(),
  })
  .strict();

export const recordPerformanceSchema = z
  .object({
    metricDate: z.string().trim().optional(),
    tasksCompleted: z.number().int().min(0).optional(),
    tasksFailed: z.number().int().min(0).optional(),
    successRate: z.number().min(0).max(1).optional(),
    avgResponseMs: z.number().int().min(0).nullable().optional(),
    creditsConsumed: z.number().int().min(0).optional(),
    costCents: z.number().int().min(0).optional(),
    totalTokens: z.number().int().min(0).optional(),
    workflowParticipations: z.number().int().min(0).optional(),
    userRating: z.number().min(0).max(5).nullable().optional(),
    errorCount: z.number().int().min(0).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

export const listMarketplaceQuerySchema = z
  .object({
    category: z.string().trim().max(80).optional(),
    search: z.string().trim().max(200).optional(),
    featured: z.enum(["true", "false"]).transform(v => v === "true").optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const publishToMarketplaceSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(4000),
    category: z.string().trim().min(1).max(80),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    icon: z.string().trim().max(120).nullable().optional(),
    featured: z.boolean().optional(),
    version: z.string().trim().max(40).optional(),
  })
  .strict();

export const rateEmployeeSchema = z
  .object({
    rating: marketplaceRatingSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export const createVersionSchema = z
  .object({
    changelog: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Collaboration messages
// ---------------------------------------------------------------------------

export const sendMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(8000),
    messageType: employeeMessageTypeSchema.optional(),
    context: z.record(z.string(), jsonValueSchema).nullable().optional(),
    parentId: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

export const delegateTaskSchema = z
  .object({
    content: z.string().trim().min(1).max(8000),
    context: z.record(z.string(), jsonValueSchema).nullable().optional(),
    parentId: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();

export const listMessagesQuerySchema = z
  .object({
    fromId: z.string().trim().min(1).max(120).optional(),
    toId: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const employeeChatSchema = z
  .object({
    message: z.string().trim().min(1).max(16000),
  })
  .strict();

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type AddSkillInput = z.infer<typeof addSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;
export type AddMemoryInput = z.infer<typeof addMemorySchema>;
export type UpdateMemoryInput = z.infer<typeof updateMemorySchema>;
export type ListMemoryQuery = z.infer<typeof listMemoryQuerySchema>;
export type SearchMemoryQuery = z.infer<typeof searchMemoryQuerySchema>;
export type TrainFromUrlInput = z.infer<typeof trainFromUrlSchema>;
export type TrainFromDocumentInput = z.infer<typeof trainFromDocumentSchema>;
export type AssignToWorkspaceInput = z.infer<typeof assignToWorkspaceSchema>;
export type PerformanceQuery = z.infer<typeof performanceQuerySchema>;
export type RecordPerformanceInput = z.infer<typeof recordPerformanceSchema>;
export type ListMarketplaceQuery = z.infer<typeof listMarketplaceQuerySchema>;
export type PublishToMarketplaceInput = z.infer<typeof publishToMarketplaceSchema>;
export type RateEmployeeInput = z.infer<typeof rateEmployeeSchema>;
export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type DelegateTaskInput = z.infer<typeof delegateTaskSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type EmployeeChatInput = z.infer<typeof employeeChatSchema>;
