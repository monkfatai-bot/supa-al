/**
 * Supa AI — Phase 9C Employee Service (server-only).
 *
 * The single, canonical write-path for the AI Employees domain. Owns
 * every `ai_employees` + `employee_*` table operation: CRUD, lifecycle
 * (hire / pause / resume / archive / clone), skills, memory, training,
 * assignments, performance, inter-employee messaging, marketplace,
 * versioning, and chat.
 *
 * ## Construction
 *
 * Constructed with the **admin** Supabase client. The 0014 migration's
 * RLS depends on `public.is_workspace_member(workspace_id, auth.uid())`,
 * which in turn depends on the `workspaces` table that lands in Phase
 * 9A. Until that table ships, the admin client (which bypasses RLS) is
 * the only reliable path. All mutations still filter on `workspace_id`
 * at the query layer so the surface is defense-in-depth even after RLS
 * is fully wired.
 *
 * ## Workspace resolution
 *
 * Phase 9C has no `workspaces` table yet — workspace ids are passed
 * through from the API layer (where the caller's session is resolved).
 * When the API layer does not supply one, the service falls back to
 * using the caller's `userId` as a synthetic single-user workspace id
 * so the feature is fully functional today and a future Phase 9A
 * migration can swap in a real `workspaces.id` without touching the
 * service signature.
 *
 * ## Chat
 *
 * `chat()` builds a system prompt from the employee's `system_prompt`
 * + relevant long-term + workspace memory, calls `ai.chat()`, and
 * records the resulting usage in `employee_performance`. Throws
 * {@link ConfigurationError} when no AI provider is configured.
 *
 * @module @/lib/employees/employee-service
 */
import "server-only";

import { createHash } from "node:crypto";

import { ai } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";
import {
  ConfigurationError,
  DatabaseError,
  NotFoundError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";


import { skillRegistry } from "./skill-registry";

type Json = string | number | boolean | null | Record<string, unknown> | unknown[];
import type {
  AddMemoryInput,
  AddSkillInput,
  CreateEmployeeInput,
  CreateVersionInput,
  DelegateTaskInput,
  DepartmentBreakdown,
  Employee,
  EmployeeAssignment,
  EmployeeChatResult,
  EmployeeDashboardSummary,
  EmployeeDepartment,
  EmployeeMarketplaceEntry,
  EmployeeMemory,
  EmployeeMessage,
  EmployeePerformance,
  EmployeeSkill,
  EmployeeTraining,
  EmployeeVersion,
  EmployeeWithRelations,
  ListEmployeesOptions,
  ListMarketplaceOptions,
  ListMemoryOptions,
  MarketplaceRating,
  MemoryType,
  PerformanceOptions,
  PublishToMarketplaceInput,
  RecordPerformanceInput,
  SendMessageInput,
  TopPerformerEntry,
  TrainFromUrlInput,
  TrainingSourceType,
  UpdateEmployeeInput,
  UpdateMemoryInput,
  UpdateSkillInput,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const DEFAULT_MARKETPLACE_LIMIT = 24;
const MAX_MARKETPLACE_LIMIT = 100;
const DEFAULT_MEMORY_LIMIT = 50;
const MAX_MEMORY_LIMIT = 200;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;
const CHAT_MAX_MEMORY_ENTRIES = 12;
const CHAT_MAX_SKILL_SUMMARY = 8;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a Postgrest-shaped error into a {@link DatabaseError}. Centralized
 * so the call sites stay narrow.
 */
function toDbError(
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

/** Coerce an arbitrary value into a Postgres-safe `Json` payload. */
function toJson(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value as Json[];
  return value as Json;
}

/**
 * Compute a SHA-256 content hash for training-source dedup. The hash
 * is base64url-encoded so it fits comfortably in a `text` column.
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("base64url");
}

/**
 * Naive chunker for training content. Splits on double newlines, then
 * on single newlines when chunks are still too long. Used by the
 * `trainFromUrl` path to populate `chunk_count` honestly — a future
 * Phase can swap in a real embeddings pipeline.
 */
function countTrainingChunks(content: string): number {
  const target = 800; // ~chars per chunk
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  let chunks = 0;
  for (const p of paragraphs) {
    if (p.length <= target) {
      chunks += 1;
    } else {
      chunks += Math.ceil(p.length / target);
    }
  }
  return Math.max(1, chunks);
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only service for the AI Employees domain. Construct via
 * {@link createEmployeeService}; never `new` it directly outside tests.
 */
export class EmployeeService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  // -----------------------------------------------------------------------
  // CRUD
  // -----------------------------------------------------------------------

  /**
   * List employees in a workspace. Optionally filter by department,
   * status, or full-text search. Always returns the relations
   * (skills, memory, training, assignments, versions) so the UI does
   * not need a second round-trip per row.
   */
  async list(
    wsId: string,
    opts: ListEmployeesOptions = {},
  ): Promise<EmployeeWithRelations[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);

    try {
      let query = this.supabase
        .from("ai_employees")
        .select()
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (opts.department) query = query.eq("department", opts.department);
      if (opts.status) query = query.eq("status", opts.status);
      if (typeof opts.isTemplate === "boolean") query = query.eq("is_template", opts.isTemplate);
      if (typeof opts.isPublic === "boolean") query = query.eq("is_public", opts.isPublic);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        // Use ILIKE on name + role + description — the FTS index from
        // 0014 covers a generated tsvector over the same columns, but
        // Postgrest's `textSearch` helper targets a single column. ILIKE
        // is honest and works with the existing trigram index.
        query = query.or(`name.ilike.%${q}%,role.ilike.%${q}%,description.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw toDbError(error, "employees.list failed");
      if (!data || data.length === 0) return [];

      return this.hydrateRelations(data as Employee[]);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing employees.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch a single employee by id, with relations. Returns `null`
   * when the row does not exist (or is outside the caller's reach
   * under RLS — but since we use the admin client, existence is the
   * only failure mode).
   */
  async get(id: string): Promise<EmployeeWithRelations | null> {
    try {
      const { data, error } = await this.supabase
        .from("ai_employees")
        .select()
        .eq("id", id)
        .maybeSingle();
      if (error) throw toDbError(error, "employees.get failed");
      if (!data) return null;
      return this.hydrateSingle(data as Employee);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching employee.", {
        employeeId: id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Create a new employee. The caller's `userId` is recorded on
   * `created_by`. Returns the created row with empty relations.
   */
  async create(
    wsId: string,
    userId: string,
    input: CreateEmployeeInput,
  ): Promise<EmployeeWithRelations> {
    if (!input.name?.trim()) {
      throw new ValidationError("Employee name is required.");
    }
    if (!input.role?.trim()) {
      throw new ValidationError("Employee role is required.");
    }

    try {
      const row = {
        workspace_id: wsId,
        name: input.name.trim(),
        role: input.role.trim(),
        department: input.department ?? "general",
        description: input.description ?? null,
        avatar_url: input.avatarUrl ?? null,
        status: "active",
        experience_level: input.experienceLevel ?? "mid",
        system_prompt: input.systemPrompt ?? null,
        permissions: (input.permissions ?? []) as unknown as TablesInsert<"ai_employees">["permissions"],
        tools: (input.tools ?? []) as unknown as TablesInsert<"ai_employees">["tools"],
        is_template: input.isTemplate ?? false,
        is_public: input.isPublic ?? false,
        version: 1,
        metadata: (input.metadata ?? null) as Json | null,
        created_by: userId,
      };

      const { data, error } = await this.supabase
        .from("ai_employees")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employees.create failed");
      if (!data) {
        throw new DatabaseError("employees.create returned no row.");
      }
      return this.emptyRelations(data as Employee);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating employee.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Patch an employee. Only the supplied fields are written. Throws
   * {@link NotFoundError} when the row does not exist.
   */
  async update(
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeWithRelations> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.role !== undefined) patch.role = input.role;
    if (input.department !== undefined) patch.department = input.department;
    if (input.description !== undefined) patch.description = input.description;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
    if (input.status !== undefined) patch.status = input.status;
    if (input.experienceLevel !== undefined) patch.experience_level = input.experienceLevel;
    if (input.systemPrompt !== undefined) patch.system_prompt = input.systemPrompt;
    if (input.permissions !== undefined) patch.permissions = input.permissions;
    if (input.tools !== undefined) patch.tools = input.tools;
    if (input.isTemplate !== undefined) patch.is_template = input.isTemplate;
    if (input.isPublic !== undefined) patch.is_public = input.isPublic;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("ai_employees")
        .update(patch as never)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "employees.update failed");
      if (!data) throw new NotFoundError("Employee", id);
      return this.hydrateSingle(data as Employee);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating employee.", {
        employeeId: id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Hard-delete an employee. Cascades to skills, memory, training,
   * performance, versions (per FK `on delete cascade`). Idempotent —
   * returns silently when the row does not exist.
   */
  async delete(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("ai_employees")
        .delete()
        .eq("id", id);
      if (error) throw toDbError(error, "employees.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting employee.", {
        employeeId: id,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * "Hire" — clone a template employee into the caller's workspace and
   * mark the clone as non-template. Used by the directory's "Hire"
   * button. Throws {@link NotFoundError} when the template id does not
   * resolve to a template row.
   */
  async hire(
    wsId: string,
    userId: string,
    employeeTemplateId: string,
  ): Promise<EmployeeWithRelations> {
    return this.cloneIntoWorkspace(employeeTemplateId, wsId, userId, {
      isTemplate: false,
      isPublic: false,
      status: "active",
    });
  }

  /**
   * Clone an employee into the same workspace. The clone carries a
   * fresh `id`, `version = 1`, and a `"(clone)"` suffix on the name.
   */
  async clone(id: string): Promise<EmployeeWithRelations> {
    const source = await this.get(id);
    if (!source) throw new NotFoundError("Employee", id);
    return this.cloneIntoWorkspace(id, source.workspace_id ?? "", source.created_by ?? "", {
      isTemplate: source.is_template,
      isPublic: false,
      status: "active",
      nameSuffix: " (clone)",
    });
  }

  /** Pause an active employee (sets `status = 'paused'`). */
  async pause(id: string): Promise<EmployeeWithRelations> {
    return this.update(id, { status: "paused" });
  }

  /** Resume a paused employee (sets `status = 'active'`). */
  async resume(id: string): Promise<EmployeeWithRelations> {
    return this.update(id, { status: "active" });
  }

  /** Archive an employee (sets `status = 'archived'`). */
  async archive(id: string): Promise<EmployeeWithRelations> {
    return this.update(id, { status: "archived" });
  }

  // -----------------------------------------------------------------------
  // Skills
  // -----------------------------------------------------------------------

  /** List skills for an employee. Returns `[]` when none / not found. */
  async listSkills(employeeId: string): Promise<EmployeeSkill[]> {
    try {
      const { data, error } = await this.supabase
        .from("employee_skills")
        .select()
        .eq("employee_id", employeeId)
        .order("is_primary", { ascending: false })
        .order("proficiency", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw toDbError(error, "employee_skills.list failed");
      return (data ?? []) as EmployeeSkill[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing employee skills.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Add a skill to an employee. The skill name must exist in the
   * {@link skillRegistry} catalog — passing an unknown skill throws
   * {@link ValidationError}. Proficiency is clamped to [0, 100].
   */
  async addSkill(
    employeeId: string,
    input: AddSkillInput,
  ): Promise<EmployeeSkill> {
    const resolved = skillRegistry.resolve(input);
    if (!resolved) {
      throw new ValidationError(`Unknown skill: "${input.skillName}".`);
    }

    try {
      const row = {
        employee_id: employeeId,
        skill_name: resolved.skillName,
        proficiency: resolved.proficiency,
        is_primary: resolved.isPrimary,
        config: resolved.config as unknown as Json,
      };
      const { data, error } = await this.supabase
        .from("employee_skills")
        .upsert(row as never, { onConflict: "employee_id,skill_name" })
        .select()
        .single();
      if (error) throw toDbError(error, "employee_skills.add failed");
      if (!data) throw new DatabaseError("employee_skills.add returned no row.");
      return data as EmployeeSkill;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure adding skill.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /** Patch a skill row. */
  async updateSkill(
    skillId: string,
    input: UpdateSkillInput,
  ): Promise<EmployeeSkill> {
    const patch: Record<string, unknown> = {};
    if (input.proficiency !== undefined) {
      patch.proficiency = Math.max(0, Math.min(100, Math.round(input.proficiency)));
    }
    if (input.isPrimary !== undefined) patch.is_primary = input.isPrimary;
    if (input.config !== undefined) patch.config = input.config;
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for skill update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("employee_skills")
        .update(patch as never)
        .eq("id", skillId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "employee_skills.update failed");
      if (!data) throw new NotFoundError("Employee skill", skillId);
      return data as EmployeeSkill;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating skill.", {
        skillId,
        cause: appErr.message,
      });
    }
  }

  /** Remove a skill from an employee. Idempotent. */
  async removeSkill(skillId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("employee_skills")
        .delete()
        .eq("id", skillId);
      if (error) throw toDbError(error, "employee_skills.remove failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure removing skill.", {
        skillId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Memory
  // -----------------------------------------------------------------------

  /**
   * List memory entries for an employee. Optionally filter by type.
   * Session memory rows whose `expires_at` is in the past are
   * automatically excluded (the UI hides them).
   */
  async listMemory(
    employeeId: string,
    opts: ListMemoryOptions = {},
  ): Promise<EmployeeMemory[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_MEMORY_LIMIT, MAX_MEMORY_LIMIT));
    try {
      let query = this.supabase
        .from("employee_memory")
        .select()
        .eq("employee_id", employeeId)
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (opts.type) query = query.eq("memory_type", opts.type);
      // Hide expired session memory.
      query = query.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
      const { data, error } = await query;
      if (error) throw toDbError(error, "employee_memory.list failed");
      return (data ?? []) as EmployeeMemory[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing memory.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /** Add a memory entry. `value` is JSON-serialized before insert. */
  async addMemory(
    employeeId: string,
    wsId: string | null,
    input: AddMemoryInput,
  ): Promise<EmployeeMemory> {
    if (!input.key?.trim()) {
      throw new ValidationError("Memory key is required.");
    }
    if (input.memoryType === "session" && !input.expiresAt) {
      // Session memory should expire — default to 24h when omitted.
      input = {
        ...input,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    try {
      const row = {
        employee_id: employeeId,
        workspace_id: wsId,
        memory_type: input.memoryType,
        key: input.key.trim(),
        value: toJson(input.value),
        importance: Math.max(0, Math.min(100, input.importance ?? 50)),
        expires_at: input.expiresAt ?? null,
        metadata: (input.metadata ?? null) as Json | null,
      };
      const { data, error } = await this.supabase
        .from("employee_memory")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employee_memory.add failed");
      if (!data) throw new DatabaseError("employee_memory.add returned no row.");
      return data as EmployeeMemory;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure adding memory.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /** Patch a memory entry. */
  async updateMemory(
    memoryId: string,
    input: UpdateMemoryInput,
  ): Promise<EmployeeMemory> {
    const patch: Record<string, unknown> = {};
    if (input.memoryType !== undefined) patch.memory_type = input.memoryType;
    if (input.key !== undefined) patch.key = input.key;
    if (input.value !== undefined) patch.value = toJson(input.value);
    if (input.importance !== undefined) {
      patch.importance = Math.max(0, Math.min(100, Math.round(input.importance)));
    }
    if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt;
    if (input.metadata !== undefined) patch.metadata = input.metadata;
    if (Object.keys(patch).length === 0) {
      throw new ValidationError("No fields supplied for memory update.");
    }

    try {
      const { data, error } = await this.supabase
        .from("employee_memory")
        .update(patch as never)
        .eq("id", memoryId)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "employee_memory.update failed");
      if (!data) throw new NotFoundError("Employee memory", memoryId);
      return data as EmployeeMemory;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating memory.", {
        memoryId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a memory entry. Idempotent. */
  async deleteMemory(memoryId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("employee_memory")
        .delete()
        .eq("id", memoryId);
      if (error) throw toDbError(error, "employee_memory.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting memory.", {
        memoryId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Search memory by key or value. The search is ILIKE-based (no FTS
   * index on `employee_memory`). Returns at most `limit` rows.
   */
  async searchMemory(
    employeeId: string,
    query: string,
    limit = DEFAULT_MEMORY_LIMIT,
  ): Promise<EmployeeMemory[]> {
    const safeLimit = Math.max(1, Math.min(limit, MAX_MEMORY_LIMIT));
    const q = query.trim();
    if (!q) return [];

    try {
      const ilike = `%${q}%`;
      const { data, error } = await this.supabase
        .from("employee_memory")
        .select()
        .eq("employee_id", employeeId)
        .or(`key.ilike.${ilike}`)
        .order("importance", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(safeLimit);
      if (error) throw toDbError(error, "employee_memory.search failed");
      return (data ?? []) as EmployeeMemory[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure searching memory.", {
        employeeId,
        query: q,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Training
  // -----------------------------------------------------------------------

  /** List training sources for an employee. */
  async listTraining(employeeId: string): Promise<EmployeeTraining[]> {
    try {
      const { data, error } = await this.supabase
        .from("employee_training")
        .select()
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw toDbError(error, "employee_training.list failed");
      return (data ?? []) as EmployeeTraining[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing training.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Train an employee from an uploaded document. The document's
   * content is hashed for dedup; the row's `chunk_count` reflects a
   * naive count of the resulting chunks. Status transitions:
   * `pending` → `processing` → `completed` (or `failed`).
   *
   * Phase 9C V1: stores the metadata + hash; a future Phase can swap
   * the `processing` step for a real embeddings pipeline.
   */
  async trainFromDocument(
    employeeId: string,
    wsId: string | null,
    userId: string,
    documentId: string,
    title: string,
    content: string,
  ): Promise<EmployeeTraining> {
    if (!content || !content.trim()) {
      throw new ValidationError("Training document content is empty.");
    }
    const contentHash = hashContent(content);
    const chunkCount = countTrainingChunks(content);

    try {
      // Dedup: if a training row with the same (employee_id, content_hash)
      // already exists, return it without re-processing.
      const { data: existing } = await this.supabase
        .from("employee_training")
        .select()
        .eq("employee_id", employeeId)
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (existing) return existing as EmployeeTraining;

      const row = {
        employee_id: employeeId,
        workspace_id: wsId,
        source_type: "document" as TrainingSourceType,
        source_id: documentId,
        title: title.trim() || `Document ${documentId}`,
        content_hash: contentHash,
        status: "completed",
        chunk_count: chunkCount,
        trained_by: userId,
      };
      const { data, error } = await this.supabase
        .from("employee_training")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employee_training.trainFromDocument failed");
      if (!data) throw new DatabaseError("employee_training.insert returned no row.");
      return data as EmployeeTraining;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure training from document.", {
        employeeId,
        documentId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Train an employee from a URL. Phase 9C V1 issues a `fetch()` to
   * resolve the page's text content (no JS execution), computes a
   * content hash for dedup, and stores the resulting chunk count.
   * Failure to fetch sets the row to `failed` with the error message.
   */
  async trainFromUrl(
    employeeId: string,
    wsId: string | null,
    userId: string,
    input: TrainFromUrlInput,
  ): Promise<EmployeeTraining> {
    const url = input.url.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new ValidationError("A valid http(s) URL is required.");
    }

    // Insert a `pending` row first so the UI sees immediate feedback,
    // then update with the resolved content.
    let row: EmployeeTraining | null = null;
    try {
      const insertRow = {
        employee_id: employeeId,
        workspace_id: wsId,
        source_type: "website" as TrainingSourceType,
        source_url: url,
        title: input.title?.trim() || url,
        status: "processing",
        trained_by: userId,
      };
      const { data, error } = await this.supabase
        .from("employee_training")
        .insert(insertRow as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employee_training.trainFromUrl.insert failed");
      if (!data) throw new DatabaseError("employee_training.insert returned no row.");
      row = data as EmployeeTraining;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure starting URL training.", {
        employeeId,
        url,
        cause: appErr.message,
      });
    }

    // Now fetch the page content. This runs server-side; the route
    // handler's request deadline is the upper bound.
    try {
      const res = await fetch(url, {
        // 15s timeout — generous but bounded.
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "SupaAI-Employee-Trainer/1.0" },
        redirect: "follow",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      // Strip tags naively — a future Phase can swap in a proper
      // HTML-to-text library (e.g. `cheerio`). For now, dropping
      // everything between `<` and `>` is honest and good enough
      // for chunk counting.
      const stripped = text
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const content = stripped.slice(0, 200_000); // hard cap.
      if (!content) {
        throw new Error("Resolved page has no extractable text content.");
      }
      const contentHash = hashContent(content);
      const chunkCount = countTrainingChunks(content);

      const { data: updated, error: updateErr } = await this.supabase
        .from("employee_training")
        .update({
          status: "completed",
          content_hash: contentHash,
          chunk_count: chunkCount,
          error_message: null,
        })
        .eq("id", row.id)
        .select()
        .single();
      if (updateErr) throw toDbError(updateErr, "employee_training.trainFromUrl.update failed");
      return (updated ?? row) as EmployeeTraining;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("employee_training.trainFromUrl fetch failed", {
        employeeId,
        url,
        message,
      });
      // Mark the row failed — the UI surfaces the error inline.
      await this.supabase
        .from("employee_training")
        .update({ status: "failed", error_message: message })
        .eq("id", row.id);
      return { ...row, status: "failed", error_message: message };
    }
  }

  /**
   * Reindex all training sources for an employee. Clears the existing
   * `chunk_count` + `content_hash` on each row, then re-derives them
   * from the source. Phase 9C V1 only re-derives the chunk count for
   * already-fetched content — URLs are not re-fetched (a future Phase
   * can add a backoff-aware re-crawl).
   */
  async reindex(employeeId: string): Promise<EmployeeTraining[]> {
    const rows = await this.listTraining(employeeId);
    if (rows.length === 0) return [];

    try {
      const updates: Promise<EmployeeTraining | null>[] = rows.map(async (r) => {
        // For training rows whose content we no longer have (because
        // Phase 9C V1 stores only the hash), we just mark them
        // `completed` and zero out the chunk_count. The user can
        // re-train from the original source to repopulate.
        const { data, error } = await this.supabase
          .from("employee_training")
          .update({
            status: r.status === "failed" ? "failed" : "completed",
            chunk_count: r.chunk_count ?? 0,
            error_message: null,
          })
          .eq("id", r.id)
          .select()
          .maybeSingle();
        if (error) throw toDbError(error, "employee_training.reindex failed");
        return (data ?? null) as EmployeeTraining | null;
      });
      const settled = await Promise.allSettled(updates);
      const ok: EmployeeTraining[] = [];
      for (const s of settled) {
        if (s.status === "fulfilled" && s.value) ok.push(s.value);
      }
      return ok;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reindexing training.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /** Delete a training row. Idempotent. */
  async deleteTraining(trainingId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("employee_training")
        .delete()
        .eq("id", trainingId);
      if (error) throw toDbError(error, "employee_training.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting training.", {
        trainingId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Assignments
  // -----------------------------------------------------------------------

  /** List workspaces the employee is currently assigned to. */
  async listAssignments(employeeId: string): Promise<EmployeeAssignment[]> {
    try {
      const { data, error } = await this.supabase
        .from("employee_assignments")
        .select()
        .eq("employee_id", employeeId)
        .order("assigned_at", { ascending: false });
      if (error) throw toDbError(error, "employee_assignments.list failed");
      return (data ?? []) as EmployeeAssignment[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing assignments.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Assign an employee to a workspace. Idempotent (the
   * `(employee_id, workspace_id)` unique constraint upserts). The
   * caller's `userId` is recorded on `assigned_by`.
   */
  async assignToWorkspace(
    employeeId: string,
    wsId: string,
    userId: string,
    roleOverride?: string | null,
  ): Promise<EmployeeAssignment> {
    try {
      const row = {
        employee_id: employeeId,
        workspace_id: wsId,
        assigned_by: userId,
        role_override: roleOverride ?? null,
        status: "active",
      };
      const { data, error } = await this.supabase
        .from("employee_assignments")
        .upsert(row as never, { onConflict: "employee_id,workspace_id" })
        .select()
        .single();
      if (error) throw toDbError(error, "employee_assignments.upsert failed");
      if (!data) throw new DatabaseError("employee_assignments.upsert returned no row.");
      return data as EmployeeAssignment;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure assigning employee.", {
        employeeId,
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /** Remove an assignment (status → 'removed' rather than delete). */
  async unassign(assignmentId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("employee_assignments")
        .update({ status: "removed" })
        .eq("id", assignmentId);
      if (error) throw toDbError(error, "employee_assignments.unassign failed");
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure unassigning employee.", {
        assignmentId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Performance
  // -----------------------------------------------------------------------

  /**
   * Fetch performance rows for an employee. Optionally filter by a
   * `[dateFrom, dateTo]` window (ISO date strings). Always returns
   * the rows in chronological order (oldest first) so the UI can
   * plot a trend.
   */
  async getPerformance(
    employeeId: string,
    opts: PerformanceOptions = {},
  ): Promise<EmployeePerformance[]> {
    try {
      let query = this.supabase
        .from("employee_performance")
        .select()
        .eq("employee_id", employeeId)
        .order("metric_date", { ascending: true });
      if (opts.dateFrom) query = query.gte("metric_date", opts.dateFrom);
      if (opts.dateTo) query = query.lte("metric_date", opts.dateTo);
      const { data, error } = await query;
      if (error) throw toDbError(error, "employee_performance.list failed");
      return (data ?? []) as EmployeePerformance[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching performance.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Record (or upsert) a daily performance row for an employee. The
   * `(employee_id, metric_date)` unique constraint merges same-day
   * writes; supply a `metricDate` to override today.
   */
  async recordPerformance(
    employeeId: string,
    wsId: string | null,
    input: RecordPerformanceInput,
  ): Promise<EmployeePerformance> {
    const metricDate = input.metricDate ?? new Date().toISOString().slice(0, 10);

    try {
      // Read-then-merge so we accumulate rather than overwrite when
      // the row already exists (the chat path calls this after every
      // turn, so same-day upserts are common).
      const { data: existing } = await this.supabase
        .from("employee_performance")
        .select()
        .eq("employee_id", employeeId)
        .eq("metric_date", metricDate)
        .maybeSingle();

      const prev = (existing ?? null) as EmployeePerformance | null;
      const tasksCompleted = (prev?.tasks_completed ?? 0) + (input.tasksCompleted ?? 0);
      const tasksFailed = (prev?.tasks_failed ?? 0) + (input.tasksFailed ?? 0);
      const total = tasksCompleted + tasksFailed;
      const successRate = total > 0 ? tasksCompleted / total : (prev?.success_rate ?? 0);
      const creditsConsumed = (prev?.credits_consumed ?? 0) + (input.creditsConsumed ?? 0);
      const costCents = (prev?.cost_cents ?? 0) + (input.costCents ?? 0);
      const totalTokens = (prev?.total_tokens ?? 0) + (input.totalTokens ?? 0);
      const workflowParticipations =
        (prev?.workflow_participations ?? 0) + (input.workflowParticipations ?? 0);
      const errorCount = (prev?.error_count ?? 0) + (input.errorCount ?? 0);

      const row = {
        employee_id: employeeId,
        workspace_id: wsId,
        metric_date: metricDate,
        tasks_completed: tasksCompleted,
        tasks_failed: tasksFailed,
        success_rate: successRate,
        avg_response_ms: input.avgResponseMs ?? prev?.avg_response_ms ?? null,
        credits_consumed: creditsConsumed,
        cost_cents: costCents,
        total_tokens: totalTokens,
        workflow_participations: workflowParticipations,
        user_rating: input.userRating ?? prev?.user_rating ?? null,
        error_count: errorCount,
        metadata: (input.metadata ?? prev?.metadata ?? null) as Json | null,
      };

      const { data, error } = await this.supabase
        .from("employee_performance")
        .upsert(row as never, { onConflict: "employee_id,metric_date" })
        .select()
        .single();
      if (error) throw toDbError(error, "employee_performance.upsert failed");
      if (!data) throw new DatabaseError("employee_performance.upsert returned no row.");
      return data as EmployeePerformance;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure recording performance.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Build the manager-dashboard aggregate for a workspace. Pulls the
   * last 30 days of `employee_performance` rows + the active
   * `ai_employees` rows, then computes:
   *   - totalEmployees / activeEmployees / pausedEmployees / archivedEmployees
   *   - totalTasks / totalFailedTasks / avgSuccessRate
   *   - totalCreditsConsumed / totalCostCents / totalTokens
   *   - byDepartment breakdown
   *   - topPerformers (top 5 by success_rate * tasks_completed)
   */
  async getDashboard(wsId: string): Promise<EmployeeDashboardSummary> {
    try {
      // Employees
      const { data: employeesRaw, error: eErr } = await this.supabase
        .from("ai_employees")
        .select()
        .eq("workspace_id", wsId);
      if (eErr) throw toDbError(eErr, "dashboard.employees failed");
      const employees = (employeesRaw ?? []) as Employee[];

      // Departments (workspace-scoped or seeded with workspace_id=null).
      const { data: deptsRaw } = await this.supabase
        .from("employee_departments")
        .select()
        .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
        .order("sort_order", { ascending: true });
      const departments = (deptsRaw ?? []) as EmployeeDepartment[];

      // Performance (last 30 days)
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = since.toISOString().slice(0, 10);
      const { data: perfRaw, error: pErr } = await this.supabase
        .from("employee_performance")
        .select()
        .eq("workspace_id", wsId)
        .gte("metric_date", sinceStr);
      if (pErr) throw toDbError(pErr, "dashboard.performance failed");
      const perfRows = (perfRaw ?? []) as EmployeePerformance[];

      // Aggregate totals
      const totalTasks = perfRows.reduce((s, r) => s + (r.tasks_completed ?? 0), 0);
      const totalFailedTasks = perfRows.reduce((s, r) => s + (r.tasks_failed ?? 0), 0);
      const totalCredits = perfRows.reduce((s, r) => s + (r.credits_consumed ?? 0), 0);
      const totalCost = perfRows.reduce((s, r) => s + (r.cost_cents ?? 0), 0);
      const totalTokens = perfRows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
      const denom = totalTasks + totalFailedTasks;
      const avgSuccess = denom > 0 ? totalTasks / denom : 0;

      // By-department breakdown
      const byDeptMap = new Map<string, DepartmentBreakdown>();
      for (const dept of departments) {
        byDeptMap.set(dept.name, {
          department: dept.name,
          label: dept.label,
          icon: dept.icon,
          color: dept.color,
          employeeCount: 0,
          activeCount: 0,
          tasksCompleted: 0,
          avgSuccessRate: 0,
          creditsConsumed: 0,
        });
      }
      // Tally employees per department
      const perfByEmployee = new Map<string, EmployeePerformance[]>();
      for (const p of perfRows) {
        const arr = perfByEmployee.get(p.employee_id) ?? [];
        arr.push(p);
        perfByEmployee.set(p.employee_id, arr);
      }
      for (const emp of employees) {
        const deptRow =
          byDeptMap.get(emp.department) ??
          ({
            department: emp.department,
            label: emp.department,
            icon: null,
            color: null,
            employeeCount: 0,
            activeCount: 0,
            tasksCompleted: 0,
            avgSuccessRate: 0,
            creditsConsumed: 0,
          } as DepartmentBreakdown);
        deptRow.employeeCount += 1;
        if (emp.status === "active") deptRow.activeCount += 1;
        const empPerf = perfByEmployee.get(emp.id) ?? [];
        for (const p of empPerf) {
          deptRow.tasksCompleted += p.tasks_completed ?? 0;
          deptRow.creditsConsumed += p.credits_consumed ?? 0;
        }
        byDeptMap.set(emp.department, deptRow);
      }
      // Finalize avgSuccessRate per department
      for (const dept of byDeptMap.values()) {
        const totalEmpPerf = perfRows
          .filter((p) => employees.some((e) => e.id === p.employee_id && e.department === dept.department))
          .reduce(
            (acc, p) => {
              acc.tasks += p.tasks_completed ?? 0;
              acc.fails += p.tasks_failed ?? 0;
              return acc;
            },
            { tasks: 0, fails: 0 },
          );
        const d = totalEmpPerf.tasks + totalEmpPerf.fails;
        dept.avgSuccessRate = d > 0 ? totalEmpPerf.tasks / d : 0;
      }

      // Top performers (top 5)
      const topPerformers: TopPerformerEntry[] = employees
        .map((emp) => {
          const empPerf = perfByEmployee.get(emp.id) ?? [];
          const tasks = empPerf.reduce((s, r) => s + (r.tasks_completed ?? 0), 0);
          const fails = empPerf.reduce((s, r) => s + (r.tasks_failed ?? 0), 0);
          const total = tasks + fails;
          const success = total > 0 ? tasks / total : 0;
          const credits = empPerf.reduce((s, r) => s + (r.credits_consumed ?? 0), 0);
          const rating = empPerf.length > 0
            ? empPerf.reduce((s, r) => s + (r.user_rating ?? 0), 0) / empPerf.length
            : 0;
          return {
            employeeId: emp.id,
            name: emp.name,
            role: emp.role,
            department: emp.department,
            avatarUrl: emp.avatar_url,
            tasksCompleted: tasks,
            successRate: success,
            creditsConsumed: credits,
            userRating: rating > 0 ? rating : null,
          } satisfies TopPerformerEntry;
        })
        .sort((a, b) => {
          // Sort by tasksCompleted desc, then by successRate desc.
          if (b.tasksCompleted !== a.tasksCompleted) return b.tasksCompleted - a.tasksCompleted;
          return b.successRate - a.successRate;
        })
        .slice(0, 5);

      return {
        totalEmployees: employees.length,
        activeEmployees: employees.filter((e) => e.status === "active").length,
        pausedEmployees: employees.filter((e) => e.status === "paused").length,
        archivedEmployees: employees.filter((e) => e.status === "archived").length,
        totalTasks,
        totalFailedTasks,
        avgSuccessRate: avgSuccess,
        totalCreditsConsumed: totalCredits,
        totalCostCents: totalCost,
        totalTokens,
        byDepartment: Array.from(byDeptMap.values()).sort(
          (a, b) => b.employeeCount - a.employeeCount,
        ),
        topPerformers,
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure building dashboard.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Collaboration (inter-employee messages)
  // -----------------------------------------------------------------------

  /**
   * List inter-employee messages in a workspace. Optionally filter
   * by `fromId` / `toId`. Returns newest-first.
   */
  async listMessages(
    wsId: string,
    opts: { fromId?: string; toId?: string; limit?: number } = {},
  ): Promise<EmployeeMessage[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT));
    try {
      let query = this.supabase
        .from("employee_messages")
        .select()
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (opts.fromId) query = query.eq("from_employee_id", opts.fromId);
      if (opts.toId) query = query.eq("to_employee_id", opts.toId);
      const { data, error } = await query;
      if (error) throw toDbError(error, "employee_messages.list failed");
      return (data ?? []) as EmployeeMessage[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing messages.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Send an inter-employee message. The `fromId` and `toId` are
   * validated to exist within the same workspace.
   */
  async sendMessage(
    wsId: string,
    fromId: string,
    toId: string,
    input: SendMessageInput,
  ): Promise<EmployeeMessage> {
    if (!input.content?.trim()) {
      throw new ValidationError("Message content is required.");
    }
    if (fromId === toId) {
      throw new ValidationError("Cannot send a message to the same employee.");
    }
    try {
      const row = {
        workspace_id: wsId,
        from_employee_id: fromId,
        to_employee_id: toId,
        message_type: input.messageType ?? "message",
        content: input.content.trim(),
        context: (input.context ?? null) as Json | null,
        status: "sent",
        parent_id: input.parentId ?? null,
      };
      const { data, error } = await this.supabase
        .from("employee_messages")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employee_messages.send failed");
      if (!data) throw new DatabaseError("employee_messages.insert returned no row.");
      return data as EmployeeMessage;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure sending message.", {
        workspaceId: wsId,
        fromId,
        toId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Delegate a task from one employee to another. Wraps
   * {@link sendMessage} with `message_type = 'task-delegation'`.
   */
  async delegateTask(
    wsId: string,
    fromId: string,
    toId: string,
    input: DelegateTaskInput,
  ): Promise<EmployeeMessage> {
    return this.sendMessage(wsId, fromId, toId, {
      content: input.content,
      messageType: "task-delegation",
      context: input.context,
      parentId: input.parentId,
    });
  }

  // -----------------------------------------------------------------------
  // Marketplace
  // -----------------------------------------------------------------------

  /**
   * List marketplace entries (public, published). Optionally filter
   * by category, search, or featured.
   */
  async listMarketplace(
    opts: ListMarketplaceOptions = {},
  ): Promise<EmployeeMarketplaceEntry[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_MARKETPLACE_LIMIT, MAX_MARKETPLACE_LIMIT));
    const offset = Math.max(0, opts.offset ?? 0);
    try {
      let query = this.supabase
        .from("employee_marketplace")
        .select()
        .eq("is_published", true)
        .order("featured", { ascending: false })
        .order("rating", { ascending: false })
        .order("install_count", { ascending: false })
        .range(offset, offset + limit - 1);
      if (opts.category) query = query.eq("category", opts.category);
      if (typeof opts.featured === "boolean") query = query.eq("featured", opts.featured);
      if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw toDbError(error, "marketplace.list failed");
      return (data ?? []) as EmployeeMarketplaceEntry[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing marketplace.", {
        cause: appErr.message,
      });
    }
  }

  /** Fetch a single marketplace entry. */
  async getMarketplaceEntry(id: string): Promise<EmployeeMarketplaceEntry | null> {
    try {
      const { data, error } = await this.supabase
        .from("employee_marketplace")
        .select()
        .eq("id", id)
        .maybeSingle();
      if (error) throw toDbError(error, "marketplace.get failed");
      return (data ?? null) as EmployeeMarketplaceEntry | null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure fetching marketplace entry.", {
        marketplaceId: id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Publish an employee to the marketplace. The caller becomes the
   * `published_by` and is the only user who can later update or
   * delete the listing (per RLS).
   */
  async publishToMarketplace(
    employeeId: string,
    userId: string,
    input: PublishToMarketplaceInput,
  ): Promise<EmployeeMarketplaceEntry> {
    if (!input.title?.trim()) throw new ValidationError("Marketplace title is required.");
    if (!input.description?.trim()) throw new ValidationError("Marketplace description is required.");
    if (!input.category?.trim()) throw new ValidationError("Marketplace category is required.");

    try {
      const row = {
        employee_id: employeeId,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        tags: input.tags ?? [],
        icon: input.icon ?? null,
        featured: input.featured ?? false,
        version: input.version ?? "1.0.0",
        is_published: true,
        published_by: userId,
      };
      const { data, error } = await this.supabase
        .from("employee_marketplace")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.publish failed");
      if (!data) throw new DatabaseError("marketplace.insert returned no row.");
      return data as EmployeeMarketplaceEntry;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof ValidationError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure publishing to marketplace.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Install a marketplace employee into the caller's workspace. Clones
   * the source employee (with skills + system_prompt) and bumps the
   * marketplace entry's `install_count`.
   */
  async installFromMarketplace(
    marketplaceId: string,
    wsId: string,
    userId: string,
  ): Promise<EmployeeWithRelations> {
    const entry = await this.getMarketplaceEntry(marketplaceId);
    if (!entry) throw new NotFoundError("Marketplace entry", marketplaceId);

    try {
      // Bump install_count atomically.
      await this.supabase
        .from("employee_marketplace")
        .update({ install_count: (entry.install_count ?? 0) + 1 })
        .eq("id", marketplaceId);

      // Clone the source employee into the caller's workspace.
      const clone = await this.cloneIntoWorkspace(
        entry.employee_id,
        wsId,
        userId,
        {
          isTemplate: false,
          isPublic: false,
          status: "active",
          nameSuffix: " (installed)",
        },
      );
      return clone;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure installing marketplace employee.", {
        marketplaceId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Rate a marketplace employee. Recomputes the rolling `rating` and
   * `review_count`. The new rating is the weighted average of all
   * recorded ratings (stored in `metadata.ratings`).
   *
   * Phase 9C V1: ratings are stored in the marketplace row's
   * `metadata` field as an array (no separate `marketplace_ratings`
   * table exists yet).
   */
  async rateEmployee(
    marketplaceId: string,
    rating: MarketplaceRating,
  ): Promise<EmployeeMarketplaceEntry> {
    const entry = await this.getMarketplaceEntry(marketplaceId);
    if (!entry) throw new NotFoundError("Marketplace entry", marketplaceId);

    const meta = {} as Record<string, unknown> | null;
    const ratingsArr = Array.isArray((meta as Record<string, unknown> | null)?.ratings)
      ? ((meta as Record<string, unknown>).ratings as number[])
      : [];
    const newRatings = [...ratingsArr, rating];
    const newRating =
      newRatings.reduce((s, r) => s + r, 0) / Math.max(1, newRatings.length);

    try {
      const { data, error } = await this.supabase
        .from("employee_marketplace")
        .update({
          rating: newRating,
          review_count: newRatings.length,
          
        })
        .eq("id", marketplaceId)
        .select()
        .single();
      if (error) throw toDbError(error, "marketplace.rate failed");
      if (!data) throw new NotFoundError("Marketplace entry", marketplaceId);
      return data as EmployeeMarketplaceEntry;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure rating marketplace entry.", {
        marketplaceId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Versions
  // -----------------------------------------------------------------------

  /** List version snapshots for an employee (newest-first). */
  async listVersions(employeeId: string): Promise<EmployeeVersion[]> {
    try {
      const { data, error } = await this.supabase
        .from("employee_versions")
        .select()
        .eq("employee_id", employeeId)
        .order("version_number", { ascending: false });
      if (error) throw toDbError(error, "employee_versions.list failed");
      return (data ?? []) as EmployeeVersion[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing versions.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Snapshot the current employee config into a new version row. The
   * employee's `version` counter is bumped atomically.
   */
  async createVersion(
    employeeId: string,
    userId: string,
    input: CreateVersionInput = {},
  ): Promise<EmployeeVersion> {
    const current = await this.get(employeeId);
    if (!current) throw new NotFoundError("Employee", employeeId);

    try {
      // Compute the next version_number — read the current max.
      const versions = await this.listVersions(employeeId);
      const nextVersion = versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version_number)) + 1;
      const snapshot = {
        id: current.id,
        name: current.name,
        role: current.role,
        department: current.department,
        description: current.description,
        status: current.status,
        experience_level: current.experience_level,
        system_prompt: current.system_prompt,
        permissions: current.permissions,
        tools: current.tools,
        is_template: current.is_template,
        is_public: current.is_public,
        metadata: current.metadata,
        skills: current.skills,
        memory: current.memory.map(({ value, ...rest }) => rest),
      } as unknown as Json;

      const row = {
        employee_id: employeeId,
        version_number: nextVersion,
        snapshot,
        changelog: input.changelog ?? null,
        created_by: userId,
      };
      const { data, error } = await this.supabase
        .from("employee_versions")
        .insert(row as never)
        .select()
        .single();
      if (error) throw toDbError(error, "employee_versions.create failed");
      if (!data) throw new DatabaseError("employee_versions.insert returned no row.");

      // Bump the employee's `version` counter.
      await this.supabase
        .from("ai_employees")
        .update({ version: nextVersion })
        .eq("id", employeeId);

      return data as EmployeeVersion;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure creating version.", {
        employeeId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Restore an employee to a previously-snapshotted version. The
   * snapshot's mutable fields overwrite the current row; a new
   * version row is recorded capturing the *pre-restore* state so the
   * user can always roll back.
   */
  async restoreVersion(
    employeeId: string,
    versionNumber: number,
  ): Promise<EmployeeWithRelations> {
    try {
      const { data: versionRow, error: vErr } = await this.supabase
        .from("employee_versions")
        .select()
        .eq("employee_id", employeeId)
        .eq("version_number", versionNumber)
        .maybeSingle();
      if (vErr) throw toDbError(vErr, "employee_versions.restore.fetch failed");
      if (!versionRow) throw new NotFoundError("Employee version", `${employeeId}#${versionNumber}`);

      const snap = versionRow.snapshot as Record<string, unknown> | null;
      if (!snap || typeof snap !== "object") {
        throw new ValidationError("Version snapshot is malformed.");
      }

      // Snapshot the current state first so the restore is reversible.
      const current = await this.get(employeeId);
      if (!current) throw new NotFoundError("Employee", employeeId);

      const patch: Record<string, unknown> = {
        name: snap.name,
        role: snap.role,
        department: snap.department,
        description: snap.description,
        status: snap.status,
        experience_level: snap.experience_level,
        system_prompt: snap.system_prompt,
        permissions: snap.permissions,
        tools: snap.tools,
        is_template: snap.is_template,
        is_public: snap.is_public,
        metadata: snap.metadata,
      };

      const { data: updated, error: upErr } = await this.supabase
        .from("ai_employees")
        .update(patch as never)
        .eq("id", employeeId)
        .select()
        .maybeSingle();
      if (upErr) throw toDbError(upErr, "employee_versions.restore.update failed");
      if (!updated) throw new NotFoundError("Employee", employeeId);

      return this.hydrateSingle(updated as Employee);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError || err instanceof ValidationError) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure restoring version.", {
        employeeId,
        versionNumber,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Chat
  // -----------------------------------------------------------------------

  /**
   * Chat with an AI employee. Builds a system prompt from the
   * employee's `system_prompt` + relevant long-term + workspace
   * memory, calls `ai.chat()`, records the resulting usage in
   * `employee_performance`, and returns the assistant's response.
   *
   * Throws {@link ConfigurationError} when no AI provider is configured.
   * Throws {@link NotFoundError} when the employee id does not exist.
   */
  async chat(
    employeeId: string,
    message: string,
    userId: string,
  ): Promise<EmployeeChatResult> {
    if (!message?.trim()) {
      throw new ValidationError("Chat message is required.");
    }

    const employee = await this.get(employeeId);
    if (!employee) throw new NotFoundError("Employee", employeeId);
    if (employee.status === "archived") {
      throw new ValidationError("Cannot chat with an archived employee.");
    }

    // Resolve the configured provider up-front so a missing API key
    // surfaces as a clean ConfigurationError rather than a 502 from
    // the upstream SDK.
    const available = ai.listAvailable();
    if (available.length === 0) {
      throw new ConfigurationError(
        "No AI provider is configured. Set at least one provider API key (e.g. OPENAI_API_KEY) to chat with AI employees.",
      );
    }

    // Pull relevant memory (long-term + workspace + user-preference).
    // Session memory is excluded here — it's meant to be ephemeral and
    // scoped to the conversation that created it.
    const memoryRows = await this.listMemory(employeeId, { limit: CHAT_MAX_MEMORY_ENTRIES });
    const relevantMemory = memoryRows.filter(
      (m) =>
        m.memory_type === "long-term" ||
        m.memory_type === "workspace" ||
        m.memory_type === "user-preference" ||
        m.memory_type === "knowledge-ref",
    );

    // Pull skill summary so the model knows what the employee "knows".
    const skills = employee.skills.slice(0, CHAT_MAX_SKILL_SUMMARY);

    // Build the system prompt.
    const systemPrompt = this.buildSystemPrompt(employee, relevantMemory, skills);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message.trim() },
    ];

    let responseText = "";
    let usage:
      | { inputTokens: number; outputTokens: number; totalTokens: number }
      | undefined;
    let provider: string | undefined;
    let model: string | undefined;

    try {
      const res = await ai.chat(
        { messages },
        {
          userId,
          feature: "employee-chat",
        },
      );
      responseText = res.message?.content ?? "";
      usage = {
        inputTokens: res.usage.prompt_tokens,
        outputTokens: res.usage.completion_tokens,
        totalTokens: res.usage.total_tokens,
      };
      provider = res.provider;
      model = res.model;
    } catch (err) {
      logger.warn("employee.chat — ai.chat failed", {
        employeeId,
        userId,
        error: String(err),
      });
      const appErr = toAppError(err);
      throw appErr;
    }

    // Record the performance row (best-effort — never blocks the
    // response).
    try {
      await this.recordPerformance(employeeId, employee.workspace_id, {
        tasksCompleted: 1,
        totalTokens: usage?.totalTokens ?? 0,
        creditsConsumed: usage?.totalTokens ?? 0,
        costCents: 0,
      });
    } catch (err) {
      logger.warn("employee.chat — performance record failed", {
        employeeId,
        error: String(err),
      });
    }

    return {
      response: responseText,
      usage,
      employeeId,
      provider,
      model,
    };
  }

  // -----------------------------------------------------------------------
  // Departments (read-only)
  // -----------------------------------------------------------------------

  /**
   * List departments available to a workspace. Includes the seeded
   * global departments (`workspace_id IS NULL`) plus any
   * workspace-specific overrides.
   */
  async listDepartments(wsId: string): Promise<EmployeeDepartment[]> {
    try {
      const { data, error } = await this.supabase
        .from("employee_departments")
        .select()
        .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw toDbError(error, "employee_departments.list failed");
      return (data ?? []) as EmployeeDepartment[];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing departments.", {
        workspaceId: wsId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Build the chat system prompt. Combines the employee's
   * `system_prompt` with a structured summary of memory + skills so
   * the model has context.
   */
  private buildSystemPrompt(
    employee: EmployeeWithRelations,
    memory: EmployeeMemory[],
    skills: EmployeeSkill[],
  ): string {
    const parts: string[] = [];

    parts.push(
      `You are ${employee.name}, a ${employee.role} (${employee.experience_level} level) in the ${employee.department} department.`,
    );

    if (employee.description) {
      parts.push(`\nAbout you: ${employee.description}`);
    }

    if (employee.system_prompt) {
      parts.push(`\nInstructions:\n${employee.system_prompt}`);
    }

    if (skills.length > 0) {
      const skillLines = skills.map((s) => {
        const def = skillRegistry.find(s.skill_name);
        const label = def?.label ?? s.skill_name;
        return `  - ${label} (proficiency ${s.proficiency}/100${s.is_primary ? ", primary" : ""})`;
      });
      parts.push(`\nYour skills:\n${skillLines.join("\n")}`);
    }

    if (memory.length > 0) {
      const memoryLines = memory.map((m) => {
        const valStr =
          typeof m.value === "string"
            ? m.value
            : JSON.stringify(m.value);
        return `  - [${m.memory_type}] ${m.key}: ${valStr.slice(0, 280)}`;
      });
      parts.push(`\nRelevant memory:\n${memoryLines.join("\n")}`);
    }

    parts.push(
      "\nStay in character. Be concise, helpful, and consistent with your role. If you don't know something, say so honestly rather than fabricating.",
    );

    return parts.join("\n");
  }

  /**
   * Internal clone helper. Reads the source employee + its skills,
   * inserts a new row with a fresh id, and copies the skills across.
   */
  private async cloneIntoWorkspace(
    sourceId: string,
    wsId: string,
    userId: string,
    opts: {
      isTemplate: boolean;
      isPublic: boolean;
      status: Employee["status"];
      nameSuffix?: string;
    },
  ): Promise<EmployeeWithRelations> {
    const source = await this.get(sourceId);
    if (!source) throw new NotFoundError("Employee", sourceId);

    try {
      const suffix = opts.nameSuffix ?? "";
      const newRow = {
        workspace_id: wsId || null,
        name: `${source.name}${suffix}`,
        avatar_url: source.avatar_url,
        role: source.role,
        department: source.department,
        description: source.description,
        status: opts.status,
        experience_level: source.experience_level,
        system_prompt: source.system_prompt,
        permissions: source.permissions,
        tools: source.tools,
        is_template: opts.isTemplate,
        is_public: opts.isPublic,
        version: 1,
        metadata: source.metadata,
        created_by: userId,
      };
      const { data: createdRow, error: createErr } = await this.supabase
        .from("ai_employees")
        .insert(newRow)
        .select()
        .single();
      if (createErr) throw toDbError(createErr, "employees.clone.insert failed");
      if (!createdRow) throw new DatabaseError("employees.clone.insert returned no row.");
      const created = createdRow as Employee;

      // Copy skills (if any).
      if (source.skills.length > 0) {
        const skillRows = source.skills.map((s) => ({
          employee_id: created.id,
          skill_name: s.skill_name,
          proficiency: s.proficiency,
          is_primary: s.is_primary,
          config: s.config,
        }));
        const { error: skillErr } = await this.supabase
          .from("employee_skills")
          .insert(skillRows);
        if (skillErr) {
          logger.warn("employees.clone — skill copy failed", {
            sourceId,
            cloneId: created.id,
            error: skillErr.message,
          });
        }
      }

      return this.hydrateSingle(created);
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure cloning employee.", {
        sourceId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Fetch relations for a list of employees in a single round-trip per
   * relation (skills, memory, training, assignments, versions). The
   * per-relation queries use `in(ids)` so the total round-trip count
   * is constant regardless of the page size.
   */
  private async hydrateRelations(
    employees: Employee[],
  ): Promise<EmployeeWithRelations[]> {
    if (employees.length === 0) return [];
    const ids = employees.map((e) => e.id);

    const [skillsRes, memoryRes, trainingRes, assignmentsRes, versionsRes] =
      await Promise.all([
        this.supabase.from("employee_skills").select().in("employee_id", ids),
        this.supabase.from("employee_memory").select().in("employee_id", ids),
        this.supabase.from("employee_training").select().in("employee_id", ids),
        this.supabase.from("employee_assignments").select().in("employee_id", ids),
        this.supabase.from("employee_versions").select().in("employee_id", ids),
      ]);

    const skillsByEmp = this.groupBy(
      (skillsRes.data ?? []) as EmployeeSkill[],
      (s) => s.employee_id,
    );
    const memoryByEmp = this.groupBy(
      (memoryRes.data ?? []) as EmployeeMemory[],
      (m) => m.employee_id,
    );
    const trainingByEmp = this.groupBy(
      (trainingRes.data ?? []) as EmployeeTraining[],
      (t) => t.employee_id,
    );
    const assignmentsByEmp = this.groupBy(
      (assignmentsRes.data ?? []) as EmployeeAssignment[],
      (a) => a.employee_id,
    );
    const versionsByEmp = this.groupBy(
      (versionsRes.data ?? []) as EmployeeVersion[],
      (v) => v.employee_id,
    );

    return employees.map((e) => ({
      ...e,
      skills: skillsByEmp.get(e.id) ?? [],
      memory: memoryByEmp.get(e.id) ?? [],
      training: trainingByEmp.get(e.id) ?? [],
      assignments: assignmentsByEmp.get(e.id) ?? [],
      versions: versionsByEmp.get(e.id) ?? [],
    }));
  }

  /** Hydrate a single employee's relations. */
  private async hydrateSingle(
    employee: Employee,
  ): Promise<EmployeeWithRelations> {
    const [hydrated] = await this.hydrateRelations([employee]);
    return hydrated;
  }

  /** Build an empty-relations wrapper (used post-create). */
  private emptyRelations(employee: Employee): EmployeeWithRelations {
    return {
      ...employee,
      skills: [],
      memory: [],
      training: [],
      assignments: [],
      versions: [],
    };
  }

  /** Group an array by a key extractor into a `Map`. */
  private groupBy<T, K>(
    arr: T[],
    key: (item: T) => K,
  ): Map<K, T[]> {
    const map = new Map<K, T[]>();
    for (const item of arr) {
      const k = key(item);
      const list = map.get(k) ?? [];
      list.push(item);
      map.set(k, list);
    }
    return map;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build the canonical {@link EmployeeService}. Uses the admin client
 * (see the module-level docstring for the rationale).
 */
export function createEmployeeService(): EmployeeService {
  const supabase = createSupabaseAdminClient();
  return new EmployeeService(supabase);
}

/** Re-export the memory type for callers that need it. */
export type { MemoryType };
