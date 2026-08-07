/**
 * Supa AI — Voice catalog service (Phase 8).
 *
 * Reads from the `voice_models` system catalog table (seeded by the
 * 0008 migration). Falls back to the in-memory catalog from
 * {@link voiceManager.listModels} when the table is empty (e.g. before
 * the migration has been applied).
 *
 * Server-only.
 *
 * @module @/lib/voice/catalog
 */
import "server-only";

import { DatabaseError, toAppError } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { voiceManager } from "@/lib/ai/voice-manager";
import type { VoiceModelInfo } from "@/lib/ai/voice-types";

import type { VoiceModel } from "./types";

export class CatalogService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * List models. When `provider` or `type` is supplied, filter the
   * results server-side; otherwise return the full catalog.
   */
  async list(opts: {
    provider?: string;
    type?: "tts" | "stt";
  } = {}): Promise<VoiceModel[]> {
    try {
      let query = this.supabase
        .from("voice_models")
        .select()
        .eq("is_active", true)
        .order("provider", { ascending: true })
        .order("name", { ascending: true });
      if (opts.provider) query = query.eq("provider", opts.provider);
      if (opts.type) query = query.eq("type", opts.type);
      const { data, error } = await query;
      if (error) throw this.toDbError(error, "voice_models.list failed");
      if (data && data.length > 0) return data;
      // Fallback to the in-memory catalog when the table is empty (e.g.
      // the migration hasn't been applied yet). Honest about this in the
      // service-level comment so callers don't expect DB-backed rows.
      return this.fromMemory(opts);
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing voice models.", {
        cause: appErr.message,
      });
    }
  }

  /** Aggregate catalog from configured providers (in-memory fallback). */
  async listFromProviders(): Promise<VoiceModelInfo[]> {
    return voiceManager.listModels();
  }

  /**
   * Convert the in-memory provider catalog into {@link VoiceModel} rows
   * so the consumer (UI / API route) sees a consistent shape regardless
   * of whether the DB catalog is hydrated.
   */
  private async fromMemory(opts: {
    provider?: string;
    type?: "tts" | "stt";
  }): Promise<VoiceModel[]> {
    const models = await voiceManager.listModels();
    return models
      .filter((m) => (opts.provider ? m.provider === opts.provider : true))
      .filter((m) => (opts.type ? m.type === opts.type : true))
      .map((m) => ({
        id: m.id, // synthetic — DB would generate a uuid.
        provider: m.provider,
        model_id: m.id,
        name: m.label,
        description: m.description ?? null,
        type: m.type,
        supported_languages: m.supportedLanguages,
        supported_voices: m.supportedVoices as never,
        is_active: true,
        metadata: (m.metadata ?? null) as never,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
  }

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

/** Build the canonical {@link CatalogService}. */
export function createCatalogService(): CatalogService {
  const supabase = createSupabaseAdminClient();
  return new CatalogService(supabase);
}
