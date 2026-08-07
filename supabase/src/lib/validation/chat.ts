/**
 * Supa AI — Chat Zod schemas (Phase 3).
 *
 * Reusable validation rules for every Phase 3 chat surface: conversations,
 * messages, folders, prompt templates, search, and the streaming send
 * endpoint. Infer types from these schemas so the runtime contract and the
 * TypeScript type can never drift apart.
 *
 * @module @/lib/validation/chat
 */
import { z } from "zod";

import { uuidSchema } from "./common";

// ---------------------------------------------------------------------------
// Providers + models
// ---------------------------------------------------------------------------

/**
 * AI provider identifiers supported by the platform. Mirrors
 * `AIProvider` in `@/lib/ai/types` so the schema is the single source of
 * truth for runtime validation.
 */
export const aiProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "deepseek",
  "qwen",
  "grok",
]);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

/**
 * Conversation title. Capped at 200 chars to keep the sidebar readable; the
 * DB column is `text` so longer values are technically valid but the API
 * enforces a sensible ceiling.
 */
const conversationTitleSchema = z
  .string()
  .trim()
  .min(1, "Title must not be empty.")
  .max(200, "Title must be at most 200 characters.");

/**
 * System prompt. Capped at 8000 chars (generous — system prompts can be
 * elaborate). Optional; when omitted the chat service applies a default.
 */
const systemPromptSchema = z
  .string()
  .trim()
  .max(8000, "System prompt must be at most 8000 characters.");

/**
 * Create-conversation payload. All fields optional — the service fills in
 * sensible defaults (title falls back to "New conversation {timestamp}").
 */
export const createConversationSchema = z
  .object({
    title: conversationTitleSchema.optional(),
    provider: aiProviderSchema.optional(),
    model: z
      .string()
      .trim()
      .min(1, "Model must not be empty.")
      .max(128, "Model must be at most 128 characters.")
      .optional(),
    systemPrompt: systemPromptSchema.optional(),
    folderId: uuidSchema.optional().nullable(),
  })
  .strict();

/**
 * Update-conversation payload. Every field optional — the service merges
 * only the provided ones. `folderId: null` moves the conversation out of
 * its folder (back to the root).
 */
export const updateConversationSchema = z
  .object({
    title: conversationTitleSchema.optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    folderId: uuidSchema.optional().nullable(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Maximum message content length. 32K matches the spec — enough for a long
 * paste without allowing pathological inputs to blow up the AI call cost.
 */
export const MAX_MESSAGE_LENGTH = 32_000;

/**
 * Message content schema. Non-empty, capped at {@link MAX_MESSAGE_LENGTH}.
 * We do NOT sanitize HTML here — code blocks would be mangled. The client
 * markdown renderer escapes HTML by default.
 */
const messageContentSchema = z
  .string()
  .min(1, "Message content must not be empty.")
  .max(
    MAX_MESSAGE_LENGTH,
    `Message content must be at most ${MAX_MESSAGE_LENGTH} characters.`,
  );

/**
 * Send-message payload (the streaming + non-streaming send endpoints).
 * `attachmentIds` is a list of `files.id` rows already uploaded by the
 * caller; the chat service attaches them to the user message.
 */
export const sendMessageSchema = z
  .object({
    conversationId: uuidSchema,
    content: messageContentSchema,
    provider: aiProviderSchema.optional(),
    model: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .optional(),
    temperature: z
      .number()
      .min(0, "Temperature must be at least 0.")
      .max(2, "Temperature must be at most 2.")
      .optional(),
    maxTokens: z
      .number()
      .int("maxTokens must be an integer.")
      .min(1, "maxTokens must be at least 1.")
      .max(100_000, "maxTokens must be at most 100000.")
      .optional(),
    attachmentIds: z.array(uuidSchema).max(20, "At most 20 attachments per message.").optional(),
  })
  .strict();

/**
 * Regenerate-message payload. Re-runs the conversation from the parent of
 * the referenced message id, producing a new branch.
 */
export const regenerateSchema = z
  .object({
    messageId: uuidSchema,
    provider: aiProviderSchema.optional(),
    model: z.string().trim().min(1).max(128).optional(),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional(),
    maxTokens: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .optional(),
  })
  .strict();

/**
 * Edit-message payload. Replaces the message content with `content`. The
 * service preserves the prior version in `edit_history`.
 */
export const editMessageSchema = z
  .object({
    content: messageContentSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Search + folders
// ---------------------------------------------------------------------------

/**
 * Search-conversations payload. `query` is matched against the conversation
 * title + last-message-preview FTS index.
 */
export const searchConversationsSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, "Search query must not be empty.")
      .max(200, "Search query must be at most 200 characters."),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

/**
 * Folder name. Capped at 80 chars for the sidebar.
 */
const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name must not be empty.")
  .max(80, "Folder name must be at most 80 characters.");

/**
 * Folder color — must be a `#RRGGBB` hex string (case-insensitive).
 */
const folderColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #RRGGBB hex string.")
  .optional();

/**
 * Create-folder payload.
 */
export const createFolderSchema = z
  .object({
    name: folderNameSchema,
    color: folderColorSchema,
  })
  .strict();

/**
 * Update-folder payload. Partial of create.
 */
export const updateFolderSchema = z
  .object({
    name: folderNameSchema.optional(),
    color: folderColorSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Prompt templates
// ---------------------------------------------------------------------------

/**
 * Template category. Open enum (string) so new categories can be added
 * without a redeploy, but a curated set is enforced for the built-in
 * templates. Custom user templates default to "custom".
 */
export const promptTemplateCategorySchema = z.enum([
  "general",
  "writing",
  "coding",
  "analysis",
  "creative",
  "business",
  "custom",
]);

/**
 * Template content. Capped at 16K chars — prompts are rarely longer, and
 * the cap keeps the table from being abused as a document store.
 */
const templateContentSchema = z
  .string()
  .trim()
  .min(1, "Template content must not be empty.")
  .max(16_000, "Template content must be at most 16000 characters.");

/**
 * Variable definition (matches the seed shape in the migration).
 */
const templateVariableSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).optional(),
  defaultValue: z.string().optional(),
});

/**
 * Create-prompt-template payload.
 */
export const createPromptTemplateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title must not be empty.")
      .max(120, "Title must be at most 120 characters."),
    description: z
      .string()
      .trim()
      .max(1000, "Description must be at most 1000 characters.")
      .optional(),
    category: promptTemplateCategorySchema,
    content: templateContentSchema,
    variables: z.array(templateVariableSchema).max(50).optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict();

/**
 * Update-prompt-template payload. Partial of create (every field optional).
 */
export const updatePromptTemplateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional(),
    description: z.string().trim().max(1000).optional(),
    category: promptTemplateCategorySchema.optional(),
    content: templateContentSchema.optional(),
    variables: z.array(templateVariableSchema).max(50).optional(),
    isFavorite: z.boolean().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RegenerateInput = z.infer<typeof regenerateSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type SearchConversationsInput = z.infer<typeof searchConversationsSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type PromptTemplateCategory = z.infer<typeof promptTemplateCategorySchema>;
export type CreatePromptTemplateInput = z.infer<typeof createPromptTemplateSchema>;
export type UpdatePromptTemplateInput = z.infer<typeof updatePromptTemplateSchema>;

// ---------------------------------------------------------------------------
// Template rendering (added by agent 12-b — Phase 3 prompt + file-context)
// ---------------------------------------------------------------------------

/**
 * Render-template payload — a record of `{variableName: value}` strings.
 * Used by POST `/api/chat/templates/:id/use`.
 *
 * Empty records are allowed (the template may have no variables). Variable
 * names are NOT validated here — the service's `renderTemplate` helper will
 * surface a {@link ValidationError} listing any missing required variables
 * at render time.
 */
export const renderTemplateSchema = z.object({
  variables: z.record(z.string(), z.string()),
});
export type RenderTemplateInput = z.infer<typeof renderTemplateSchema>;
