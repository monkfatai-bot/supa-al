/**
 * Supa AI — User settings service (Phase 2).
 *
 * Owns reads + writes of the `user_settings` table. The service exposes
 * a deliberately narrow mutation surface: callers can update theme,
 * density, notification preferences, privacy preferences, and session
 * timeout — but NOT `two_factor_enabled` (that flows through the
 * dedicated 2FA enrollment path, never a direct column update).
 *
 * @module @/lib/auth/settings
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesUpdate } from "@/lib/supabase/types";

import type { AnySupabaseClient } from "@/lib/auth/helpers";

/** Row shape for the `user_settings` table. */
export type UserSettings = Tables<"user_settings">;

/**
 * Subset of `user_settings` columns that a caller is allowed to mutate
 * directly through this service.
 *
 * Note: `two_factor_enabled` is intentionally absent — it is only ever
 * changed by the dedicated 2FA enrollment flow (which also rotates backup
 * codes + verifies a TOTP challenge).
 */
export interface UpdateSettingsInput {
  theme?: UserSettings["theme"];
  density?: UserSettings["density"];
  notification_email?: boolean;
  notification_push?: boolean;
  notification_marketing?: boolean;
  notification_security?: boolean;
  notification_product_updates?: boolean;
  privacy_profile_visible?: boolean;
  privacy_activity_visible?: boolean;
  privacy_show_in_search?: boolean;
  /** Range: 5..10080 minutes (1 week max). */
  session_timeout_minutes?: number;
}

/** Min/max bounds for `session_timeout_minutes`. */
const MIN_SESSION_TIMEOUT_MINUTES = 5;
const MAX_SESSION_TIMEOUT_MINUTES = 60 * 24 * 7; // 10 080

/**
 * Service object encapsulating all `user_settings` operations. Constructed
 * with a typed Supabase client (server or admin). The factory
 * {@link createSettingsService} wires the RLS-enforced server client.
 */
export class UserSettingsService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Read the caller's settings row. Throws {@link NotFoundError} if the row
   * has not been provisioned yet (the `handle_new_user()` trigger normally
   * creates one on signup).
   */
  async getSettings(userId: string): Promise<UserSettings> {
    try {
      const { data, error } = await this.supabase
        .from("user_settings")
        .select()
        .eq("id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "getSettings failed");
      if (!data) {
        throw new NotFoundError("User settings", userId);
      }
      return data;
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading user_settings.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Update the caller's settings row. Only fields present on `input` are
   * mutated; absent fields are left untouched. `two_factor_enabled` cannot
   * be set through this method (see {@link UpdateSettingsInput}).
   *
   * @throws {ValidationError} if `session_timeout_minutes` is outside the
   *   allowed range or a theme/density value is invalid.
   * @throws {NotFoundError} if the caller's settings row does not exist.
   * @throws {DatabaseError} on any other Supabase failure.
   */
  async updateSettings(
    userId: string,
    input: UpdateSettingsInput,
  ): Promise<UserSettings> {
    const updates = this.buildUpdatePayload(input);
    if (Object.keys(updates).length === 0) {
      // No-op: just return the current row.
      return this.getSettings(userId);
    }

    try {
      const { data, error } = await this.supabase
        .from("user_settings")
        .update(updates)
        .eq("id", userId)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "updateSettings failed");
      if (!data) {
        throw new NotFoundError("User settings", userId);
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
      throw new DatabaseError("Unexpected failure updating user_settings.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Translate {@link UpdateSettingsInput} into a typed `TablesUpdate<"user_settings">`
   * payload, validating each field along the way.
   */
  private buildUpdatePayload(
    input: UpdateSettingsInput,
  ): TablesUpdate<"user_settings"> {
    const updates: TablesUpdate<"user_settings"> = {};

    if (input.theme !== undefined) {
      if (!["light", "dark", "system"].includes(input.theme)) {
        throw new ValidationError(
          `Invalid theme "${input.theme}". Allowed: light, dark, system.`,
          { field: "theme", value: input.theme },
        );
      }
      updates.theme = input.theme;
    }
    if (input.density !== undefined) {
      if (!["comfortable", "compact"].includes(input.density)) {
        throw new ValidationError(
          `Invalid density "${input.density}". Allowed: comfortable, compact.`,
          { field: "density", value: input.density },
        );
      }
      updates.density = input.density;
    }
    if (input.notification_email !== undefined)
      updates.notification_email = input.notification_email;
    if (input.notification_push !== undefined)
      updates.notification_push = input.notification_push;
    if (input.notification_marketing !== undefined)
      updates.notification_marketing = input.notification_marketing;
    if (input.notification_security !== undefined)
      updates.notification_security = input.notification_security;
    if (input.notification_product_updates !== undefined)
      updates.notification_product_updates = input.notification_product_updates;
    if (input.privacy_profile_visible !== undefined)
      updates.privacy_profile_visible = input.privacy_profile_visible;
    if (input.privacy_activity_visible !== undefined)
      updates.privacy_activity_visible = input.privacy_activity_visible;
    if (input.privacy_show_in_search !== undefined)
      updates.privacy_show_in_search = input.privacy_show_in_search;
    if (input.session_timeout_minutes !== undefined) {
      const v = input.session_timeout_minutes;
      if (
        !Number.isInteger(v) ||
        v < MIN_SESSION_TIMEOUT_MINUTES ||
        v > MAX_SESSION_TIMEOUT_MINUTES
      ) {
        throw new ValidationError(
          `session_timeout_minutes must be an integer between ${MIN_SESSION_TIMEOUT_MINUTES} and ${MAX_SESSION_TIMEOUT_MINUTES}.`,
          { field: "session_timeout_minutes", value: v },
        );
      }
      updates.session_timeout_minutes = v;
    }
    return updates;
  }

  /**
   * Map a Postgrest error into our {@link DatabaseError}. A few error codes
   * are recognized (23505 unique violation → still a DatabaseError here since
   * user_settings has no user-visible unique columns; PGRST116 row missing →
   * NotFoundError handled by the caller).
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

/**
 * Build the canonical RLS-enforced `UserSettingsService` for use in
 * Server Components + Route Handlers. The caller's auth session is
 * propagated; only their own settings row is reachable.
 */
export async function createSettingsService(): Promise<UserSettingsService> {
  const supabase = await createSupabaseServerClient();
  return new UserSettingsService(supabase);
}
