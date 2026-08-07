/**
 * Supa AI — Phase 9 Workspace Zod schemas.
 *
 * Reusable validation rules for every Phase 9 workspace surface:
 * workspaces, members, invitations, folders, documents, comments,
 * knowledge_base, files, mentions, activity, and global search.
 *
 * Infer types from these schemas so the runtime contract and the
 * TypeScript type can never drift apart.
 *
 * @module @/lib/validation/workspace
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums (mirror the CHECK constraints in 0009_phase7_workspace.sql)
// ---------------------------------------------------------------------------

export const workspaceTypeSchema = z.enum([
  "personal",
  "team",
  "organization",
]);

export const workspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "editor",
  "viewer",
  "member",
]);

export const workspaceMemberStatusSchema = z.enum([
  "active",
  "invited",
  "suspended",
  "removed",
]);

export const documentContentTypeSchema = z.enum([
  "markdown",
  "plain",
  "html",
  "json",
]);

export const documentStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const knowledgeSourceTypeSchema = z.enum([
  "document",
  "file",
  "url",
  "manual",
  "ai-generated",
]);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required.")
  .max(120, "Name must be at most 120 characters.");

const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required.")
  .max(200, "Title must be at most 200 characters.");

const slugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required.")
  .max(120, "Slug must be at most 120 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase kebab-case (e.g. my-workspace).",
  );

const descriptionSchema = z
  .string()
  .trim()
  .max(4000, "Description must be at most 4000 characters.");

const urlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .url("Please provide a valid URL.")
  .refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://");

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .email("Please provide a valid email.")
  .max(254, "Email must be at most 254 characters.");

const uuidSchema = z
  .string()
  .trim()
  .min(1, "ID is required.")
  .uuid("ID must be a valid UUID.");

const bodySchema = z
  .string()
  .trim()
  .min(1, "Body is required.")
  .max(16000, "Body must be at most 16000 characters.");

const stringArraySchema = z
  .array(z.string().trim().min(1).max(80))
  .max(50, "A maximum of 50 tags is allowed.");

const metadataSchema = z.record(z.string(), z.unknown()).nullable();

// ---------------------------------------------------------------------------
// Workspace CRUD
// ---------------------------------------------------------------------------

export const createWorkspaceSchema = z
  .object({
    name: nameSchema,
    slug: slugSchema.optional(),
    description: descriptionSchema.optional().nullable(),
    logoUrl: urlSchema.nullable().optional(),
    type: workspaceTypeSchema.optional(),
    settings: metadataSchema.optional(),
  })
  .strict();

export const updateWorkspaceSchema = z
  .object({
    name: nameSchema.optional(),
    slug: slugSchema.optional(),
    description: descriptionSchema.optional().nullable(),
    logoUrl: urlSchema.nullable().optional(),
    type: workspaceTypeSchema.optional(),
    settings: metadataSchema.optional(),
    isArchived: z.boolean().optional(),
    aiCreditsPool: z.number().int().min(0).max(10_000_000).optional(),
  })
  .strict();

export const listWorkspacesQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    type: workspaceTypeSchema.optional(),
    includeArchived: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Members + invitations
// ---------------------------------------------------------------------------

export const inviteMemberSchema = z
  .object({
    email: emailSchema,
    role: workspaceRoleSchema.optional(),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    role: workspaceRoleSchema.optional(),
    status: workspaceMemberStatusSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const createFolderSchema = z
  .object({
    name: nameSchema,
    parentId: uuidSchema.nullable().optional(),
  })
  .strict();

export const renameFolderSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export const moveFolderSchema = z
  .object({
    parentId: uuidSchema.nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const createDocumentSchema = z
  .object({
    title: titleSchema,
    content: z.string().max(1_000_000).nullable().optional(),
    contentType: documentContentTypeSchema.optional(),
    folderId: uuidSchema.nullable().optional(),
    status: documentStatusSchema.optional(),
  })
  .strict();

export const updateDocumentSchema = z
  .object({
    title: titleSchema.optional(),
    content: z.string().max(1_000_000).nullable().optional(),
    contentType: documentContentTypeSchema.optional(),
    folderId: uuidSchema.nullable().optional(),
    status: documentStatusSchema.optional(),
  })
  .strict();

export const listDocumentsQuerySchema = z
  .object({
    folderId: uuidSchema.nullable().optional(),
    search: z.string().trim().max(200).optional(),
    status: documentStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export const createCommentSchema = z
  .object({
    workspaceId: uuidSchema,
    documentId: uuidSchema.nullable().optional(),
    parentId: uuidSchema.nullable().optional(),
    body: bodySchema,
  })
  .strict();

export const updateCommentSchema = z
  .object({
    body: bodySchema.optional(),
    resolved: z.boolean().optional(),
  })
  .strict();

export const listCommentsQuerySchema = z
  .object({
    workspaceId: uuidSchema,
    documentId: uuidSchema.optional(),
    resolved: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export const createKnowledgeArticleSchema = z
  .object({
    title: titleSchema,
    content: z.string().max(1_000_000).nullable().optional(),
    source: z.string().trim().max(500).nullable().optional(),
    sourceType: knowledgeSourceTypeSchema.optional(),
    tags: stringArraySchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const updateKnowledgeArticleSchema = z
  .object({
    title: titleSchema.optional(),
    content: z.string().max(1_000_000).nullable().optional(),
    source: z.string().trim().max(500).nullable().optional(),
    sourceType: knowledgeSourceTypeSchema.optional(),
    tags: stringArraySchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export const listKnowledgeQuerySchema = z
  .object({
    search: z.string().trim().max(200).optional(),
    tag: z.string().trim().max(80).optional(),
    sourceType: knowledgeSourceTypeSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Activity + search
// ---------------------------------------------------------------------------

export const listActivityQuerySchema = z
  .object({
    resourceType: z.string().trim().max(80).optional(),
    resourceId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

export const workspaceSearchQuerySchema = z
  .object({
    q: z.string().trim().min(1, "Query is required.").max(200),
    kinds: z
      .enum(["documents", "knowledge", "files", "folders"])
      .array()
      .max(4)
      .optional(),
    limit: z.coerce.number().int().min(1).max(25).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Mentions
// ---------------------------------------------------------------------------

export const createMentionSchema = z
  .object({
    workspaceId: uuidSchema,
    documentId: uuidSchema.nullable().optional(),
    commentId: uuidSchema.nullable().optional(),
    mentionedUserId: uuidSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** Max upload size accepted by the API route (25 MB). */
export const MAX_FILE_UPLOAD_BYTES = 25 * 1024 * 1024;

export const uploadFileSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(200).nullable().optional(),
    folderId: uuidSchema.nullable().optional(),
  })
  .strict();
