/**
 * Supa AI — Phase 5 AI Video — model catalog service.
 *
 * Owns the `video_models` table for the video surface. Provides a `list`
 * method that merges the persisted catalog rows with the per-provider
 * static catalog exposed by {@link videoManager.listAllModels}. The
 * merge keeps the UI honest: admin-configured overrides win, but when
 * no row exists for a known provider model, the provider's static entry
 * is surfaced so the catalog is never empty even before an admin wires
 * up the catalog rows.
 *
 * @module @/lib/video/catalog
 */
import "server-only";

import {
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { videoManager } from "@/lib/ai/video-manager";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VideoModelRow } from "./types";

/** Grouped catalog entry returned by `list()`. */
export interface VideoCatalogGroup {
  provider: string;
  models: VideoCatalogModel[];
}

/** Flattened model entry returned to the UI. */
export interface VideoCatalogModel {
  id: string;
  provider: string;
  modelId: string;
  name: string;
  description: string | null;
  maxDuration: number | null;
  supportedResolutions: string[];
  supportedTypes: string[];
  isActive: boolean;
  /** Whether the row was sourced from the DB (`true`) or the provider's
   * static catalog (`false` — used when no admin-configured row exists). */
  source: "db" | "provider";
}

export class VideoCatalogService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * List the catalog grouped by provider. Active DB rows win; provider
   * static entries are added when no DB row exists for the same
   * `(provider, model_id)` pair.
   */
  async list(): Promise<VideoCatalogGroup[]> {
    let dbRows: VideoModelRow[] = [];
    try {
      const { data, error } = await this.supabase
        .from("video_models")
        .select()
        .order("sort_order", { ascending: true })
        .order("provider", { ascending: true });
      if (error) throw this.toDbError(error, "video_models.list failed");
      dbRows = data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) {
        logger.warn("video catalog DB read failed; falling back to provider static catalog", {
          error: err.message,
        });
      } else {
        const appErr = toAppError(err);
        logger.warn("video catalog DB read failed unexpectedly", {
          error: appErr.message,
        });
      }
    }

    // Pull provider static catalog best-effort — never block the response
    // when a provider's catalog call fails (e.g. unconfigured provider).
    const providerModels = await videoManager.listAllModels().catch(() => []);

    const seen = new Set<string>();
    const out: VideoCatalogModel[] = [];

    // DB rows first (admin overrides win).
    for (const row of dbRows) {
      const key = `${row.provider}:${row.model_id}`;
      seen.add(key);
      out.push(this.fromDbRow(row));
    }

    // Then provider static catalog entries that aren't already represented.
    for (const m of providerModels) {
      const key = `${m.provider}:${m.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: m.id,
        provider: m.provider,
        modelId: m.id,
        name: m.label,
        description: m.description ?? null,
        maxDuration: m.maxDuration ?? null,
        supportedResolutions: m.supportedResolutions ?? [],
        supportedTypes: m.supportedTypes ?? [],
        isActive: true,
        source: "provider",
      });
    }

    // Group by provider.
    const grouped = new Map<string, VideoCatalogModel[]>();
    for (const m of out) {
      const list = grouped.get(m.provider) ?? [];
      list.push(m);
      grouped.set(m.provider, list);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, models]) => ({ provider, models }));
  }

  private fromDbRow(row: VideoModelRow): VideoCatalogModel {
    return {
      id: row.id,
      provider: row.provider,
      modelId: row.model_id,
      name: row.name,
      description: row.description,
      maxDuration: row.max_duration,
      supportedResolutions: row.supported_resolutions ?? [],
      supportedTypes: row.supported_types ?? [],
      isActive: row.is_active,
      source: "db",
    };
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

/** Build the canonical {@link VideoCatalogService}. */
export function createVideoCatalogService(): VideoCatalogService {
  return new VideoCatalogService(createSupabaseAdminClient());
}
