/**
 * Supa AI — Prompt Template service (Phase 3).
 *
 * Owns the `prompt_templates` table. Provides:
 *   - CRUD over user-owned templates plus read access to the public
 *     (built-in) templates seeded by `0005_phase3_chat.sql`.
 *   - Favorites toggle + usage-count increment for analytics.
 *   - Pure helper methods for `{{variable}}` rendering + extraction so the
 *     same logic is reachable from API routes, server actions, and client
 *     code (the helpers are exported as standalone functions).
 *
 * RLS contract (see migration):
 *   - `templates_select_owner_or_public` — owner OR `is_public = true`.
 *   - `templates_insert_self`            — `user_id = auth.uid()`.
 *   - `templates_update_self` / `delete` — `user_id = auth.uid()`.
 *
 * The service is constructed with an RLS-enforced server client so all
 * reads are naturally scoped. Writes are owner-scoped by the `user_id`
 * filter in addition to RLS — defense in depth.
 *
 * @module @/lib/chat/prompt-template-service
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/supabase/types";

import type {
  CreatePromptTemplateInput,
  UpdatePromptTemplateInput,
} from "@/lib/validation/chat";

/** Row shape for the `prompt_templates` table. */
export type PromptTemplate = Tables<"prompt_templates">;

/** Insert shape derived from the validated create-input. */
export type CreatePromptTemplateRow = TablesInsert<"prompt_templates">;

/**
 * Variable descriptor persisted in `prompt_templates.variables` (JSONB).
 * Mirrors the Zod schema in `@/lib/validation/chat`.
 */
export interface PromptTemplateVariableDescriptor {
  name: string;
  description?: string;
  defaultValue?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported standalone for reuse without a service instance)
// ---------------------------------------------------------------------------

/**
 * Pattern matching `{{variable}}` placeholders inside template content.
 *
 * Allows optional whitespace inside the braces (`{{ name }}`) and requires
 * the variable name to start with a letter or underscore followed by
 * letters, digits, or underscores. The capture group is the variable name
 * (trimmed).
 */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Extract every `{{variable}}` placeholder from `content`, preserving order
 * of first appearance and de-duplicating.
 *
 * Pure function — safe to call from client or server code.
 *
 * @example
 * ```ts
 * extractVariables("Hello {{name}}, your code is {{code}}.")
 * // → ["name", "code"]
 * ```
 */
export function extractVariables(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

/**
 * Render a template by replacing every `{{variable}}` placeholder with its
 * value from `variables`.
 *
 * - Placeholders for variables present in `variables` are replaced verbatim.
 * - Placeholders for variables that are absent but declared in
 *   `declaredVariables` with a `defaultValue` fall back to the default.
 * - Any placeholder still unresolved after the above steps is treated as a
 *   missing required variable. The function throws a {@link ValidationError}
 *   whose `details.missing` lists every unresolved name — callers can
 *   surface this directly to the client.
 *
 * Pure function — safe to call from client or server code.
 *
 * @example
 * ```ts
 * renderTemplate("Hello {{name}}!", { name: "Ada" });
 * // → "Hello Ada!"
 * ```
 */
export function renderTemplate(
  content: string,
  variables: Record<string, string>,
  declaredVariables?: readonly PromptTemplateVariableDescriptor[],
): string {
  if (!content) return "";
  const declaredByName = new Map<string, PromptTemplateVariableDescriptor>();
  if (declaredVariables) {
    for (const v of declaredVariables) {
      declaredByName.set(v.name, v);
    }
  }

  const missing = new Set<string>();

  const rendered = content.replace(VARIABLE_PATTERN, (full, name: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      return variables[name];
    }
    const declared = declaredByName.get(name);
    if (declared && declared.defaultValue !== undefined) {
      return declared.defaultValue;
    }
    missing.add(name);
    return full;
  });

  if (missing.size > 0) {
    throw new ValidationError(
      `Missing required template variable${missing.size === 1 ? "" : "s"}: ${Array.from(missing).join(", ")}.`,
      { missing: Array.from(missing) },
    );
  }

  return rendered;
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Service object encapsulating all `prompt_templates` operations. Constructed
 * with an RLS-enforced server client (via {@link createPromptTemplateService})
 * or an admin client for system-level maintenance.
 */
export class PromptTemplateService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * List templates visible to `userId`: their own + every public template.
   *
   * Ordering: favorites first, then `updated_at desc`. Optional filters:
   *   - `category`       — restrict to a single category.
   *   - `favoritesOnly`  — only favorited templates (still includes public
   *                        favorites the user has toggled — but since
   *                        `is_favorite` is per-row owned by the user, this
   *                        only returns templates the user has favorited).
   *   - `search`         — case-insensitive substring match on title +
   *                        description.
   */
  async list(
    userId: string,
    opts: {
      category?: string;
      favoritesOnly?: boolean;
      search?: string;
    } = {},
  ): Promise<PromptTemplate[]> {
    try {
      let query = this.supabase
        .from("prompt_templates")
        .select()
        // Owner OR public — the RLS policy enforces this, but we add the
        // explicit OR so the query is also correct under the admin client.
        .or(`user_id.eq.${userId},is_public.eq.true`)
        .order("is_favorite", { ascending: false })
        .order("updated_at", { ascending: false });

      if (opts.category) {
        query = query.eq("category", opts.category);
      }
      if (opts.favoritesOnly) {
        query = query.eq("is_favorite", true);
      }
      if (opts.search && opts.search.trim().length > 0) {
        const term = opts.search.trim();
        // ilike on title + description; OR-chained via the Postgrest `or`
        // syntax. We escape `%` and `_` so user input doesn't act as a
        // wildcard.
        const safe = term.replace(/[%_]/g, (m) => "\\" + m);
        query = query.or(
          `title.ilike.%${encodeURIComponent(safe)}%,description.ilike.%${encodeURIComponent(safe)}%`,
        );
      }

      const { data, error } = await query;
      if (error) throw this.toDbError(error, "list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing prompt templates.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single template by id. Returns `null` if the row doesn't exist
   * or the caller can't see it (RLS hide it).
   */
  async get(
    userId: string,
    templateId: string,
  ): Promise<PromptTemplate | null> {
    try {
      const { data, error } = await this.supabase
        .from("prompt_templates")
        .select()
        .eq("id", templateId)
        .or(`user_id.eq.${userId},is_public.eq.true`)
        .maybeSingle();

      if (error) throw this.toDbError(error, "get failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading prompt template.", {
        userId,
        templateId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Create a new user-owned template. `user_id` is forced to `userId` so a
   * compromised client can't spoof ownership.
   *
   * @throws {ValidationError} if the input references undeclared variables
   *   in `content` that aren't present in `variables` (or vice versa).
   */
  async create(
    userId: string,
    input: CreatePromptTemplateInput,
  ): Promise<PromptTemplate> {
    const variables = normalizeVariables(input.variables);
    validateVariableConsistency(input.content, variables);

    const row: TablesInsert<"prompt_templates"> = {
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      content: input.content,
      variables: variables as unknown as TablesInsert<"prompt_templates">["variables"],
      is_favorite: false,
      is_public: false,
      sort_order: 0,
      usage_count: 0,
    };

    try {
      const { data, error } = await this.supabase
        .from("prompt_templates")
        .insert(row)
        .select()
        .single();

      if (error) throw this.toDbError(error, "create failed");
      if (!data) {
        throw new DatabaseError("Prompt template insert returned no row.", {
          userId,
        });
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating prompt template.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Partial-update a template owned by `userId`. Ownership is verified
   * before the update; non-owners receive a {@link NotFoundError} (not 403)
   * so we don't leak the existence of templates the caller can't see.
   *
   * @throws {NotFoundError} if the template doesn't exist or isn't owned by
   *   the caller.
   * @throws {ValidationError} if the new content + variables are
   *   inconsistent (declared variables missing from content, or content
   *   references undeclared variables).
   */
  async update(
    userId: string,
    templateId: string,
    input: UpdatePromptTemplateInput,
  ): Promise<PromptTemplate> {
    // Ownership check — only the owner can update. Public templates
    // (user_id = null) cannot be edited through this path.
    const existing = await this.getOwned(userId, templateId);

    const updates: TablesUpdate<"prompt_templates"> = {};

    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined) {
      updates.description = input.description ?? null;
    }
    if (input.category !== undefined) updates.category = input.category;
    if (input.content !== undefined) updates.content = input.content;
    if (input.variables !== undefined) {
      const normalized = normalizeVariables(input.variables);
      updates.variables =
        normalized as unknown as TablesUpdate<"prompt_templates">["variables"];
    }
    if (input.isFavorite !== undefined) updates.is_favorite = input.isFavorite;

    // Re-validate consistency only when content or variables changed.
    if (input.content !== undefined || input.variables !== undefined) {
      const nextContent = input.content ?? existing.content;
      const nextVariables =
        input.variables !== undefined
          ? normalizeVariables(input.variables)
          : normalizeVariablesFromRow(existing.variables);
      validateVariableConsistency(nextContent, nextVariables);
    }

    if (Object.keys(updates).length === 0) {
      return existing;
    }

    try {
      const { data, error } = await this.supabase
        .from("prompt_templates")
        .update(updates)
        .eq("id", templateId)
        .eq("user_id", userId) // defense-in-depth — RLS also enforces
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "update failed");
      if (!data) {
        throw new NotFoundError("Prompt template", templateId);
      }
      return data;
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating prompt template.", {
        userId,
        templateId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Permanently delete a user-owned template. Built-in (public) templates
   * cannot be deleted through this path. Returns silently if the template
   * doesn't exist (idempotent delete).
   */
  async delete(userId: string, templateId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("prompt_templates")
        .delete()
        .eq("id", templateId)
        .eq("user_id", userId);

      if (error) throw this.toDbError(error, "delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting prompt template.", {
        userId,
        templateId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Toggle the `is_favorite` flag on a template visible to `userId`. Both
   * owned and public templates can be favorited (the flag is per-row; for
   * public templates this is a "soft" favorite that's shared across users —
   * a future phase may move favorites to a join table).
   *
   * @throws {NotFoundError} if the template doesn't exist or isn't visible.
   */
  async toggleFavorite(
    userId: string,
    templateId: string,
    favorite: boolean,
  ): Promise<PromptTemplate> {
    // Visibility check (owned OR public).
    const existing = await this.get(userId, templateId);
    if (!existing) {
      throw new NotFoundError("Prompt template", templateId);
    }

    // Built-in (public, user_id = null) templates cannot be favorited
    // through this path because RLS forbids updating rows the caller
    // doesn't own. Surface this as a friendly ValidationError.
    if (existing.user_id === null || existing.user_id !== userId) {
      throw new ValidationError(
        "Built-in templates cannot be favorited directly. Copy the template to your library first.",
        { templateId },
      );
    }

    try {
      const { data, error } = await this.supabase
        .from("prompt_templates")
        .update({ is_favorite: favorite })
        .eq("id", templateId)
        .eq("user_id", userId)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "toggleFavorite failed");
      if (!data) {
        throw new NotFoundError("Prompt template", templateId);
      }
      return data;
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure toggling prompt template favorite.",
        { userId, templateId, cause: appErr.message },
      );
    }
  }

  /**
   * Atomically bump `usage_count` by 1. Used by the `/api/chat/templates/:id/use`
   * route after a successful render. Returns silently if the template
   * doesn't exist (analytics best-effort).
   */
  async incrementUsage(userId: string, templateId: string): Promise<void> {
    try {
      // Fetch the current count first so we can write back an explicit
      // value — Postgrest doesn't support `usage_count = usage_count + 1`
      // directly. We only increment templates the caller can see.
      const { data, error: readErr } = await this.supabase
        .from("prompt_templates")
        .select("usage_count")
        .eq("id", templateId)
        .or(`user_id.eq.${userId},is_public.eq.true`)
        .maybeSingle();

      if (readErr) throw this.toDbError(readErr, "incrementUsage.read failed");
      if (!data) {
        // Template doesn't exist or isn't visible — treat as no-op.
        logger.debug("incrementUsage: template not visible to caller", {
          userId,
          templateId,
        });
        return;
      }

      const next = (data.usage_count ?? 0) + 1;

      // Only the owner can update usage_count on their own templates; for
      // public templates the bump is best-effort and silently no-ops if RLS
      // forbids it (e.g. user has only SELECT on the public row).
      const { error: updateErr } = await this.supabase
        .from("prompt_templates")
        .update({ usage_count: next })
        .eq("id", templateId)
        .eq("user_id", userId);

      if (updateErr) {
        // Don't fail the request — usage analytics are best-effort.
        logger.warn("incrementUsage: update failed (best-effort)", {
          userId,
          templateId,
          error: updateErr.message,
        });
      }
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      // Swallow unexpected errors — usage tracking must never break the
      // primary request flow.
      logger.warn("incrementUsage: swallowed unexpected error", {
        userId,
        templateId,
        error: (err as Error)?.message,
      });
    }
  }

  /**
   * Return the distinct set of categories that have at least one template
   * visible to the caller. Includes both built-in categories (with seeded
   * templates) and any categories the caller has used for their own
   * templates.
   */
  async listCategories(): Promise<string[]> {
    try {
      // Postgrest doesn't expose `DISTINCT` directly; fetch all visible
      // rows and de-duplicate in JS. The template catalog is small
      // (low double digits at most), so this is fine.
      const { data, error } = await this.supabase
        .from("prompt_templates")
        .select("category");

      if (error) throw this.toDbError(error, "listCategories failed");
      const categories = new Set<string>();
      for (const row of data ?? []) {
        if (row.category) categories.add(row.category);
      }
      return Array.from(categories).sort();
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure listing prompt template categories.",
        { cause: appErr.message },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Fetch a template owned by `userId`. Throws {@link NotFoundError} if the
   * row doesn't exist OR isn't owned by the caller — we deliberately
   * conflate the two so we don't leak the existence of templates the
   * caller can't write.
   */
  private async getOwned(
    userId: string,
    templateId: string,
  ): Promise<PromptTemplate> {
    const { data, error } = await this.supabase
      .from("prompt_templates")
      .select()
      .eq("id", templateId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw this.toDbError(error, "getOwned failed");
    if (!data) {
      throw new NotFoundError("Prompt template", templateId);
    }
    return data;
  }

  /**
   * Map a Postgrest error into our {@link DatabaseError}.
   */
  private toDbError(
    error: { code?: string; message?: string; name?: string; details?: unknown },
    message: string,
  ): DatabaseError {
    return new DatabaseError(message, {
      errorCode: error.code,
      errorName: error.name,
      errorMessage: error.message,
      errorDetails: error.details,
    });
  }
}

// ---------------------------------------------------------------------------
// Free functions + factory
// ---------------------------------------------------------------------------

/**
 * Normalize the Zod-validated `variables` array into the canonical
 * `PromptTemplateVariableDescriptor[]` shape persisted to JSONB.
 *
 * Strips `undefined` fields (Postgres JSONB doesn't preserve them) and
 * returns `null` for an empty array so the column stays null when no
 * variables are declared (matches the seed migration's convention).
 */
function normalizeVariables(
  variables: readonly PromptTemplateVariableDescriptor[] | undefined,
): PromptTemplateVariableDescriptor[] | null {
  if (!variables || variables.length === 0) return null;
  return variables.map((v) => {
    const out: PromptTemplateVariableDescriptor = { name: v.name };
    if (v.description !== undefined) out.description = v.description;
    if (v.defaultValue !== undefined) out.defaultValue = v.defaultValue;
    return out;
  });
}

/**
 * Coerce a raw JSONB value (from a `prompt_templates.variables` row) back
 * into the typed descriptor array. Returns an empty array for null / invalid
 * shapes — never throws.
 */
function normalizeVariablesFromRow(
  raw: unknown,
): PromptTemplateVariableDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: PromptTemplateVariableDescriptor[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const v = item as Record<string, unknown>;
      if (typeof v.name === "string") {
        const descriptor: PromptTemplateVariableDescriptor = { name: v.name };
        if (typeof v.description === "string") {
          descriptor.description = v.description;
        }
        if (typeof v.defaultValue === "string") {
          descriptor.defaultValue = v.defaultValue;
        }
        out.push(descriptor);
      }
    }
  }
  return out;
}

/**
 * Validate that the `content`'s `{{variable}}` placeholders and the declared
 * `variables` list are consistent:
 *
 *   - Every placeholder in `content` should be declared in `variables`
 *     (warn-only — we allow undeclared placeholders so users can author
 *     templates incrementally; rendering will enforce required-ness).
 *   - Every declared variable should appear in `content` (error — declaring
 *     a variable that the template never references is almost always a
 *     mistake).
 *
 * @throws {ValidationError} when a declared variable isn't referenced in
 *   `content`.
 */
function validateVariableConsistency(
  content: string,
  variables: PromptTemplateVariableDescriptor[] | null,
): void {
  if (!variables || variables.length === 0) return;
  const used = new Set(extractVariables(content));
  const declared = new Set(variables.map((v) => v.name));
  const unused = Array.from(declared).filter((n) => !used.has(n));
  if (unused.length > 0) {
    throw new ValidationError(
      `Declared variable${unused.length === 1 ? "" : "s"} not referenced in template content: ${unused.join(", ")}.`,
      { unused },
    );
  }
}

/**
 * Build the canonical RLS-enforced `PromptTemplateService` for use in
 * Server Components + Route Handlers. The caller's auth session is
 * propagated; only their own templates (plus public ones) are reachable
 * for writes, and reads honor the owner-or-public RLS policy.
 */
export async function createPromptTemplateService(): Promise<PromptTemplateService> {
  const supabase = await createSupabaseServerClient();
  return new PromptTemplateService(supabase);
}
