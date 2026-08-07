/**
 * Supa AI — Phase 4 Image catalog helpers (server-only).
 *
 * Lists available image models (filtered to active rows + configured
 * providers) and the curated `image_styles` catalog. The dashboard's
 * image picker consumes these via `/api/images/models` and
 * `/api/images/styles`.
 *
 * @module @/lib/image/catalog
 */
import "server-only";

import {
  ConfigurationError,
  DatabaseError,
  toAppError,
} from "@/lib/errors";
import { imageRegistry } from "@/lib/ai/image-registry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { ImageModelRow, ImageStyle } from "./types";

/**
 * List active image models, optionally filtered to providers with an API
 * key configured. When `onlyConfigured` is true (the default), models
 * whose provider is not configured are filtered out — so the picker only
 * surfaces models the operator has wired up.
 */
export async function listImageModels(
  onlyConfigured = true,
  supabase: AdminSupabaseClient = createSupabaseAdminClient(),
): Promise<ImageModelRow[]> {
  try {
    const { data, error } = await supabase
      .from("image_models")
      .select()
      .eq("is_active", true)
      .order("provider", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      throw new DatabaseError("image.listModels failed", {
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
    const rows = data ?? [];
    if (!onlyConfigured) return rows;
    const configured = new Set(imageRegistry.listAvailable());
    return rows.filter((r) => configured.has(r.provider as never));
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    const appErr = toAppError(err);
    throw new DatabaseError("Unexpected failure listing image models.", {
      cause: appErr.message,
    });
  }
}

/** List the curated image styles, ordered by category then key. */
export async function listImageStyles(
  supabase: AdminSupabaseClient = createSupabaseAdminClient(),
): Promise<ImageStyle[]> {
  try {
    const { data, error } = await supabase
      .from("image_styles")
      .select()
      .order("category", { ascending: true })
      .order("key", { ascending: true });
    if (error) {
      throw new DatabaseError("image.listStyles failed", {
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
    return data ?? [];
  } catch (err) {
    if (err instanceof DatabaseError) throw err;
    const appErr = toAppError(err);
    throw new DatabaseError("Unexpected failure listing image styles.", {
      cause: appErr.message,
    });
  }
}

/** Re-export for the API route's "no providers configured" check. */
export function requireImageProviderConfigured(): void {
  if (imageRegistry.listAvailable().length === 0) {
    throw new ConfigurationError(
      "No image provider is configured. Set at least one of OPENAI_API_KEY, STABILITY_API_KEY, REPLICATE_API_TOKEN, FAL_KEY, IDEOGRAM_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.",
    );
  }
}
