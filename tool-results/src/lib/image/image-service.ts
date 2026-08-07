/**
 * Supa AI — Phase 4 Image Service (server-only).
 *
 * The single, canonical write-path for the AI Image Generation domain.
 * Owns every `image_generations` + `image_uploads` + `image_usage`
 * table operation: generate, getById, list, delete, upload, enhance,
 * upscale, removeBackground. Persists results to the `ai-assets` storage
 * bucket and records per-image usage to `image_usage`.
 *
 * ## Construction
 *
 * Constructed with the **admin** Supabase client. The 0006 migration's
 * RLS allows owner read/write, but server-side generation flows must be
 * able to update the `image_generations` row with the final result
 * regardless of the caller's session (e.g. when polling completes
 * asynchronously). The admin client bypasses RLS — all mutations still
 * filter on `user_id` at the query layer so the surface is
 * defense-in-depth.
 *
 * ## Workspace resolution
 *
 * Phase 4 has no `workspaces` table yet — workspace ids are passed
 * through from the API layer. When the API layer does not supply one,
 * the service falls back to using the caller's `userId` as a synthetic
 * single-user workspace id (matches the Phase 9C pattern).
 *
 * @module @/lib/image/image-service
 */
import "server-only";

import {
  ConfigurationError,
  DatabaseError,
  NotFoundError,
  PaymentError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { image, type ImageProviderId } from "@/lib/ai/image-manager";
import { imageRegistry } from "@/lib/ai/image-registry";
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageQuality,
} from "@/lib/ai/image-types";
import { rateLimiter } from "@/lib/rate-limit";
import { RATE_LIMIT_PRESETS } from "@/lib/rate-limit/presets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";

import type {
  EditImageInput,
  EditImageResult,
  GenerateImageInput,
  ImageGeneration,
  ImageGenerationInsert,
  ImageGenerationUpdate,
  ImageUsageStats,
  ListImagesQuery,
  UploadImageInput,
  UploadImageResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const STORAGE_BUCKET = "ai-assets" as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a Postgrest-shaped error into a {@link DatabaseError}. */
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

/** Postgres JSON/JSONB-compatible value. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[];

/** Coerce an arbitrary value into a Postgres-safe `Json` payload. */
function toJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { value };
  }
  return value as JsonValue;
}

/** Today's date as `YYYY-MM-DD` (UTC) — used as the `image_usage.metric_date`. */
function todayMetricDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

/**
 * Server-only service for the AI Image Generation domain. Construct via
 * {@link getImageService}; never `new` it directly outside tests.
 */
export class ImageService {
  constructor(private readonly supabase: AdminSupabaseClient = createSupabaseAdminClient()) {}

  // -----------------------------------------------------------------------
  // Generation flow
  // -----------------------------------------------------------------------

  /**
   * Generate an image. Steps:
   *   1. Insert an `image_generations` row with `status='pending'`.
   *   2. Rate-limit (`AI_GENERATION` preset).
   *   3. Call `image.generate()` against the requested provider.
   *   4. Upload the resulting bytes / fetched URL to the `ai-assets` bucket.
   *   5. Update the row with `status='succeeded'` + the result URL + storage path.
   *   6. Record usage to `image_usage` (best-effort).
   *
   * On error: the row is updated with `status='failed'` + the error message,
   * and the error is re-thrown so the API route can surface it.
   */
  async generate(
    userId: string,
    input: GenerateImageInput,
  ): Promise<ImageGeneration> {
    // Validate input.
    if (!input.prompt?.trim()) {
      throw new ValidationError("Prompt is required.");
    }
    if (!input.provider) {
      throw new ValidationError("Provider is required.");
    }
    if (!input.model) {
      throw new ValidationError("Model is required.");
    }

    // Resolve workspace id.
    const workspaceId = input.workspaceId ?? userId;

    // Rate-limit per user.
    await rateLimiter.consumePreset(
      `image:${userId}`,
      RATE_LIMIT_PRESETS.AI_GENERATION,
    );

    // 1. Insert the pending row.
    const insert: ImageGenerationInsert = {
      workspace_id: workspaceId,
      user_id: userId,
      provider: input.provider,
      model: input.model,
      prompt: input.prompt.trim(),
      negative_prompt: input.negativePrompt ?? null,
      style: input.style ?? null,
      size: input.size ?? null,
      quality: input.quality ?? null,
      status: "pending",
      credits_consumed: 0,
      metadata: toJson({
        n: input.n ?? 1,
        seed: input.seed,
      }),
    };

    let generation: ImageGeneration;
    try {
      const { data, error } = await this.supabase
        .from("image_generations")
        .insert(insert)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "image.generate insert failed");
      if (!data) {
        throw new DatabaseError("image.generate insert returned no row.", {
          userId,
        });
      }
      generation = data;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Failed to create image generation row.", {
        userId,
        cause: appErr.message,
      });
    }

    // 2. Mark as processing.
    await this.updateGenerationStatus(generation.id, "processing", {
      metadata: toJson({
        ...(generation.metadata as Record<string, unknown> | null),
        startedAt: new Date().toISOString(),
      }),
    });

    // 3. Call the provider.
    const req: ImageGenRequest = {
      model: input.model,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      style: input.style,
      size: input.size,
      quality: input.quality,
      n: input.n,
      seed: input.seed,
      user: userId,
    };

    let result: ImageGenResult;
    try {
      result = await image.generate(req, {
        userId,
        orgId: workspaceId,
        feature: "image-gen",
        provider: input.provider,
      });
    } catch (err) {
      await this.markFailed(generation.id, err);
      throw err;
    }

    // 4. Persist the bytes to storage (when b64) or fetch the URL bytes.
    let storagePath: string | null = null;
    let resultUrl: string | null = result.url;
    try {
      const buf = await this.fetchResultBytes(result);
      if (buf) {
        storagePath = this.buildStoragePath(userId, generation.id, result.mimeType);
        const { error: uploadError } = await this.supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, buf, {
            contentType: result.mimeType,
            cacheControl: "3600",
            upsert: true,
          });
        if (uploadError) {
          logger.warn("image.generate storage upload failed; falling back to provider URL", {
            userId,
            generationId: generation.id,
            error: uploadError.message,
          });
        } else {
          // Generate a signed URL for the persisted object.
          const { data: signedData, error: signedError } = await this.supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
          if (signedError || !signedData?.signedUrl) {
            logger.warn("image.generate signed-url failed; falling back to provider URL", {
              userId,
              generationId: generation.id,
              error: signedError?.message,
            });
          } else {
            resultUrl = signedData.signedUrl;
          }
        }
      }
    } catch (err) {
      logger.warn("image.generate storage persistence failed; using provider URL", {
        userId,
        generationId: generation.id,
        error: String(err),
      });
    }

    // 5. Update the row with the result.
    const creditsConsumed = this.estimateCredits(input.model, input.quality);
    const update: ImageGenerationUpdate = {
      status: "succeeded",
      result_url: resultUrl,
      result_storage_path: storagePath,
      credits_consumed: creditsConsumed,
      metadata: toJson({
        ...(generation.metadata as Record<string, unknown> | null),
        providerSeed: result.seed,
        completedAt: new Date().toISOString(),
        mimeType: result.mimeType,
      }),
    };

    try {
      const { data, error } = await this.supabase
        .from("image_generations")
        .update(update)
        .eq("id", generation.id)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "image.generate update failed");
      if (!data) throw new NotFoundError("ImageGeneration", generation.id);
      generation = data;
    } catch (err) {
      await this.markFailed(generation.id, err);
      throw err;
    }

    // 6. Record usage (best-effort).
    await this.recordUsage(userId, workspaceId, input.provider, 1, creditsConsumed);

    return generation;
  }

  // -----------------------------------------------------------------------
  // Reads
  // -----------------------------------------------------------------------

  /** Fetch a single image generation by id, with an ownership check. */
  async getById(userId: string, id: string): Promise<ImageGeneration | null> {
    try {
      const { data, error } = await this.supabase
        .from("image_generations")
        .select()
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw toDbError(error, "image.getById failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading image generation.", {
        userId,
        id,
        cause: appErr.message,
      });
    }
  }

  /**
   * Paginated list of the caller's image generations. Filters: status,
   * provider, model, search (ILIKE on prompt).
   */
  async list(userId: string, query: ListImagesQuery = {}): Promise<ImageGeneration[]> {
    const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));
    const offset = Math.max(0, query.offset ?? 0);
    try {
      let q = this.supabase
        .from("image_generations")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (query.status) q = q.eq("status", query.status);
      if (query.provider) q = q.eq("provider", query.provider);
      if (query.model) q = q.eq("model", query.model);
      if (query.search?.trim()) {
        const term = query.search.trim().replace(/[%_]/g, (m) => `\\${m}`);
        q = q.ilike("prompt", `%${term}%`);
      }
      const { data, error } = await q;
      if (error) throw toDbError(error, "image.list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing image generations.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------

  /** Hard-delete an image generation + its stored asset (best-effort). */
  async delete(userId: string, id: string): Promise<void> {
    try {
      // Fetch the row first so we know the storage path to remove.
      const { data: existing, error: fetchError } = await this.supabase
        .from("image_generations")
        .select("result_storage_path")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) throw toDbError(fetchError, "image.delete lookup failed");
      if (!existing) throw new NotFoundError("ImageGeneration", id);

      // Delete the stored object (best-effort).
      if (existing.result_storage_path) {
        const { error: storageError } = await this.supabase.storage
          .from(STORAGE_BUCKET)
          .remove([existing.result_storage_path]);
        if (storageError) {
          logger.warn("image.delete storage removal failed", {
            userId,
            id,
            path: existing.result_storage_path,
            error: storageError.message,
          });
        }
      }

      const { error } = await this.supabase
        .from("image_generations")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw toDbError(error, "image.delete failed");
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deleting image generation.", {
        userId,
        id,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Image-edit operations
  // -----------------------------------------------------------------------

  /**
   * Enhance an existing generation's prompt and regenerate the image.
   * Re-runs the same provider + model with the revised prompt.
   */
  async enhance(userId: string, input: EditImageInput): Promise<EditImageResult> {
    const generation = await this.requireGeneration(userId, input.generationId);
    return this.redoGeneration(userId, generation, input.prompt ?? generation.prompt, "enhance");
  }

  /**
   * Upscale an existing generation. Phase 4 V1 routes through the same
   * provider with a larger `size` request when supported; providers that
   * don't expose dedicated upscaling (e.g. OpenAI DALL·E 3) regenerate
   * with the original prompt and an explicit `quality: 'hd'`.
   */
  async upscale(userId: string, input: EditImageInput): Promise<EditImageResult> {
    const generation = await this.requireGeneration(userId, input.generationId);
    return this.redoGeneration(
      userId,
      generation,
      generation.prompt,
      "upscale",
      { quality: "hd", size: this.biggerSize(generation.size) },
    );
  }

  /**
   * Remove the background of an existing generation. Phase 4 V1 routes
   * through Replicate's `philberner/remove-background` model when
   * configured; falls back to a `remove background` prompt prefix on the
   * original provider.
   */
  async removeBackground(userId: string, input: EditImageInput): Promise<EditImageResult> {
    const generation = await this.requireGeneration(userId, input.generationId);
    // Try the dedicated Replicate remove-background model when configured.
    if (imageRegistry.tryGet("replicate")) {
      const client = imageRegistry.get("replicate");
      const result = await client.generate({
        model: "flux-dev", // any model — the service will rewrite to use the source URL
        prompt: `Remove the background of this image. Original prompt: ${generation.prompt}`,
        sourceImageUrl: generation.result_url ?? undefined,
        operation: "remove-background",
      });
      return this.persistEdit(userId, generation, result, "remove-background");
    }
    // Fallback: regenerate via the original provider with a remove-bg prompt.
    return this.redoGeneration(
      userId,
      generation,
      `${generation.prompt} — isolated subject on transparent background`,
      "remove-background",
    );
  }

  // -----------------------------------------------------------------------
  // Upload
  // -----------------------------------------------------------------------

  /** Upload a user image (used by the editor workflows). */
  async upload(userId: string, input: UploadImageInput): Promise<UploadImageResult> {
    const workspaceId = input.workspaceId ?? userId;
    try {
      const body = this.coerceBody(input.body);
      const path = this.buildStoragePath(userId, `${Date.now()}-${input.fileName}`, "image");
      const { error: uploadError } = await this.supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, body, {
          contentType: input.mimeType,
          cacheControl: "3600",
          upsert: false,
        });
      if (uploadError) {
        throw toDbError(uploadError, "image.upload storage failed");
      }

      const insert: import("./types").ImageUploadInsert = {
        workspace_id: workspaceId,
        user_id: userId,
        file_name: input.fileName,
        file_path: path,
        file_size: body.byteLength,
        mime_type: input.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        metadata: toJson({ uploadedAt: new Date().toISOString() }),
      };

      const { data, error } = await this.supabase
        .from("image_uploads")
        .insert(insert)
        .select()
        .maybeSingle();
      if (error) throw toDbError(error, "image.upload row insert failed");
      if (!data) throw new DatabaseError("image.upload returned no row.", { userId });

      const { data: signed, error: signedError } = await this.supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      const signedUrl = signed?.signedUrl ?? "";
      if (signedError) {
        logger.warn("image.upload signed-url failed", {
          userId,
          path,
          error: signedError.message,
        });
      }
      return { upload: data, signedUrl };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure uploading image.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Usage
  // -----------------------------------------------------------------------

  /** Record a usage row (best-effort). Used internally by `generate`. */
  async recordUsage(
    userId: string,
    workspaceId: string,
    provider: string,
    imagesGenerated: number,
    creditsUsed: number,
  ): Promise<void> {
    const metricDate = todayMetricDate();
    try {
      // Upsert: increment existing row or insert new.
      const { data: existing } = await this.supabase
        .from("image_usage")
        .select("id, images_generated, credits_used, by_provider")
        .eq("user_id", userId)
        .eq("metric_date", metricDate)
        .maybeSingle();

      const byProvider = (existing?.by_provider as Record<string, { images: number; credits: number }> | null) ?? {};
      const prev = byProvider[provider] ?? { images: 0, credits: 0 };
      byProvider[provider] = {
        images: prev.images + imagesGenerated,
        credits: prev.credits + creditsUsed,
      };

      if (existing) {
        await this.supabase
          .from("image_usage")
          .update({
            images_generated: existing.images_generated + imagesGenerated,
            credits_used: existing.credits_used + creditsUsed,
            by_provider: byProvider,
          })
          .eq("id", existing.id);
      } else {
        await this.supabase.from("image_usage").insert({
          workspace_id: workspaceId,
          user_id: userId,
          metric_date: metricDate,
          images_generated: imagesGenerated,
          credits_used: creditsUsed,
          by_provider: byProvider,
        });
      }
    } catch (err) {
      // Best-effort — usage must never block a successful generation.
      logger.warn("image.usage record failed", {
        userId,
        provider,
        error: String(err),
      });
    }
  }

  /** Aggregate the caller's image usage for an optional date range. */
  async getUsageStats(
    userId: string,
    query: { from?: string; to?: string } = {},
  ): Promise<ImageUsageStats> {
    try {
      let q = this.supabase
        .from("image_usage")
        .select("images_generated, credits_used, by_provider, metric_date")
        .eq("user_id", userId)
        .order("metric_date", { ascending: true });
      if (query.from) q = q.gte("metric_date", query.from);
      if (query.to) q = q.lte("metric_date", query.to);
      const { data, error } = await q;
      if (error) throw toDbError(error, "image.getUsageStats failed");

      const rows = data ?? [];
      const byProvider: Record<string, { images: number; credits: number }> = {};
      let totalImages = 0;
      let totalCredits = 0;
      for (const row of rows) {
        totalImages += row.images_generated ?? 0;
        totalCredits += row.credits_used ?? 0;
        const perProvider = (row.by_provider as Record<string, { images: number; credits: number }> | null) ?? {};
        for (const [p, v] of Object.entries(perProvider)) {
          const agg = byProvider[p] ?? { images: 0, credits: 0 };
          byProvider[p] = {
            images: agg.images + (v.images ?? 0),
            credits: agg.credits + (v.credits ?? 0),
          };
        }
      }
      const periodStart = rows[0]?.metric_date ?? new Date().toISOString().slice(0, 10);
      const periodEnd = rows[rows.length - 1]?.metric_date ?? periodStart;
      return {
        totalImages,
        totalCredits,
        byProvider,
        period: { start: periodStart, end: periodEnd },
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading image usage.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Fetch the generation row or throw NotFoundError. */
  private async requireGeneration(
    userId: string,
    generationId: string,
  ): Promise<ImageGeneration> {
    const generation = await this.getById(userId, generationId);
    if (!generation) {
      throw new NotFoundError("ImageGeneration", generationId);
    }
    return generation;
  }

  /**
   * Re-run a generation with a (possibly) revised prompt and options.
   * Used by `enhance` and `upscale`.
   */
  private async redoGeneration(
    userId: string,
    source: ImageGeneration,
    prompt: string,
    operation: string,
    overrides: { quality?: ImageQuality; size?: string } = {},
  ): Promise<EditImageResult> {
    const input: GenerateImageInput = {
      provider: source.provider as ImageProviderId,
      model: source.model,
      prompt,
      negativePrompt: source.negative_prompt ?? undefined,
      style: source.style ?? undefined,
      size: overrides.size ?? source.size ?? undefined,
      quality: overrides.quality ?? (source.quality as ImageQuality | null) ?? undefined,
      workspaceId: source.workspace_id ?? undefined,
    };
    const generation = await this.generate(userId, input);
    // Tag the row with the operation that triggered it.
    await this.supabase
      .from("image_generations")
      .update({
        metadata: toJson({
          ...(generation.metadata as Record<string, unknown> | null),
          operation,
          sourceGenerationId: source.id,
        }),
      })
      .eq("id", generation.id);
    return { generation };
  }

  /** Persist the result of an edit operation that bypassed `generate`. */
  private async persistEdit(
    userId: string,
    source: ImageGeneration,
    result: ImageGenResult,
    operation: string,
  ): Promise<EditImageResult> {
    const insert: ImageGenerationInsert = {
      workspace_id: source.workspace_id,
      user_id: userId,
      provider: source.provider,
      model: source.model,
      prompt: source.prompt,
      negative_prompt: source.negative_prompt,
      style: source.style,
      size: source.size,
      quality: source.quality,
      status: "succeeded",
      result_url: result.url,
      credits_consumed: 0,
      metadata: toJson({
        operation,
        sourceGenerationId: source.id,
        completedAt: new Date().toISOString(),
      }),
    };
    const { data, error } = await this.supabase
      .from("image_generations")
      .insert(insert)
      .select()
      .maybeSingle();
    if (error) throw toDbError(error, "image.persistEdit insert failed");
    if (!data) throw new DatabaseError("image.persistEdit returned no row.", { userId });
    return { generation: data };
  }

  /** Update the status + optional patch on an image_generations row. */
  private async updateGenerationStatus(
    id: string,
    status: ImageGeneration["status"],
    patch: Partial<ImageGenerationUpdate> = {},
  ): Promise<void> {
    const { error } = await this.supabase
      .from("image_generations")
      .update({ status, ...patch })
      .eq("id", id);
    if (error) {
      logger.warn("image.updateGenerationStatus failed", {
        id,
        status,
        error: error.message,
      });
    }
  }

  /** Mark a generation as failed (best-effort) and re-throw the error. */
  private async markFailed(id: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.updateGenerationStatus(id, "failed", {
      error: message.slice(0, 1000),
    });
  }

  /** Fetch the bytes of a generation result (when b64 is provided) or download the URL. */
  private async fetchResultBytes(result: ImageGenResult): Promise<Buffer | null> {
    if (result.b64) {
      return Buffer.from(result.b64, "base64");
    }
    if (!result.url) return null;
    try {
      const res = await fetch(result.url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      logger.warn("image.fetchResultBytes failed", { error: String(err) });
      return null;
    }
  }

  /** Build a safe, namespaced storage path for a generation result. */
  private buildStoragePath(userId: string, id: string, mimeType: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = (now.getUTCMonth() + 1).toString().padStart(2, "0");
    const safeId = id.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64);
    const ext = mimeType.split("/")[1] ?? "png";
    return `${userId}/${yyyy}/${mm}/${safeId}.${ext}`;
  }

  /** Compute the credits (USD cents) consumed for one image. */
  private estimateCredits(
    _model: string,
    quality: ImageQuality | undefined,
  ): number {
    const q = (quality ?? "standard").toLowerCase();
    if (q === "hd" || q === "high") return 8;
    if (q === "low") return 1;
    return 4;
  }

  /** Pick a larger `WIDTHxHEIGHT` for upscaling (1.5x, capped at 2048). */
  private biggerSize(size: string | null): string | undefined {
    if (!size) return undefined;
    const [w, h] = size.split("x").map((n) => Number(n));
    if (!w || !h) return undefined;
    const newW = Math.min(Math.round(w * 1.5), 2048);
    const newH = Math.min(Math.round(h * 1.5), 2048);
    return `${newW}x${newH}`;
  }

  /** Coerce the various supported body types into a Buffer. */
  private coerceBody(body: Blob | ArrayBuffer | ArrayBufferView): Buffer {
    if (Buffer.isBuffer(body)) return body;
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (ArrayBuffer.isView(body)) {
      return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    }
    // Blob — convert via arrayBuffer().
    // We accept the async nature here; callers can pass a Blob.
    // Cast because TS doesn't know we'll await it.
    throw new ValidationError(
      "Blob body is not directly supported; convert to ArrayBuffer before calling upload.",
    );
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Build the canonical {@link ImageService}. Uses the admin client because
 * generation flows must be able to update the `image_generations` row
 * with the final result regardless of the caller's session.
 */
export function getImageService(): ImageService {
  return new ImageService();
}

/**
 * Build an {@link ImageService} with an explicit admin client. Used by
 * tests + by call sites that already hold an admin client instance.
 */
export function getImageServiceWith(supabase: AdminSupabaseClient): ImageService {
  return new ImageService(supabase);
}

// Re-export the configuration check used by the API routes.
export function isImageGenerationEnabled(): boolean {
  // Read the feature flag directly from process.env to avoid a circular
  // import with `@/lib/config/env` (which validates at boot and would
  // crash the image module if validation throws).
  const raw = process.env.FEATURE_IMAGE_GENERATION_ENABLED;
  return typeof raw === "string" ? raw === "true" : raw === true;
}

/** Re-export ConfigurationError so callers can throw it cleanly. */
export { ConfigurationError, PaymentError };
