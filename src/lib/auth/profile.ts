/**
 * Supa AI — Profile service (Phase 2).
 *
 * Owns the `profiles` table — the rich user profile (1:1 with
 * `auth.users`). Provides:
 *   - Direct reads of the caller's profile.
 *   - A narrow update surface (full_name, username, phone_number, country,
 *     time_zone, locale, bio, company, job_title, website, avatar_url).
 *     Admin-only fields (account_status, subscription_plan,
 *     credits_balance) cannot be mutated through this service.
 *   - {@link getDashboardData} — a single aggregation method returning
 *     everything the user dashboard needs in one round-trip.
 *
 * Username uniqueness is enforced case-insensitively. The uniqueness
 * lookup uses the **admin** Supabase client (lazily constructed) so it
 * can see other users' usernames despite RLS hiding them from the
 * server client. The actual update still goes through the injected
 * client — RLS is enforced on the write path.
 *
 * @module @/lib/auth/profile
 */
import "server-only";

import {
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Tables,
  TablesUpdate,
} from "@/lib/supabase/types";

import type { ActivityLog } from "@/lib/auth/activity";
import type { AnySupabaseClient } from "@/lib/auth/helpers";
import type { Notification } from "@/lib/auth/notifications";
import type { UserSettings } from "@/lib/auth/settings";

/** Row shape for the `profiles` table. */
export type Profile = Tables<"profiles">;

/**
 * Subset of `profiles` columns a caller is allowed to update directly.
 *
 * Admin-only fields (`account_status`, `subscription_plan`,
 * `credits_balance`) are intentionally absent — they flow through the
 * dedicated admin paths (billing webhook, moderation tools).
 */
export interface UpdateProfileInput {
  full_name?: string | null;
  username?: string | null;
  phone_number?: string | null;
  country?: string | null;
  time_zone?: string;
  locale?: string;
  bio?: string | null;
  company?: string | null;
  job_title?: string | null;
  website?: string | null;
}

/** Aggregated snapshot consumed by the user dashboard (`/` route). */
export interface DashboardData {
  profile: Profile;
  settings: UserSettings;
  unreadNotificationCount: number;
  recentActivity: ActivityLog[];
  recentNotifications: Notification[];
  /** Convenience: same as `profile.credits_balance`. */
  creditsBalance: number;
  /** Convenience: same as `profile.subscription_plan`. */
  plan: Profile["subscription_plan"];
}

/** Maximum username length (matches typical social handles). */
const USERNAME_MAX_LENGTH = 32;
/** Minimum username length. */
const USERNAME_MIN_LENGTH = 3;
/** Username allowed character set: lowercase letters, digits, hyphen, underscore. */
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/;

/**
 * Service object encapsulating all `profiles` operations. Constructed
 * with a typed Supabase client (server or admin).
 */
export class ProfileService {
  /** Primary client — RLS-enforced when constructed via {@link createProfileService}. */
  private readonly supabase: AnySupabaseClient;
  /** Lazily-constructed admin client, used for the username uniqueness lookup. */
  private _adminClient: AdminSupabaseClient | null = null;

  constructor(supabase: AnySupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Read the caller's profile row. Returns `null` if no profile exists
   * (the `handle_new_user()` trigger normally creates one on signup).
   */
  async getProfile(userId: string): Promise<Profile | null> {
    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .select()
        .eq("id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "getProfile failed");
      return data ?? null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure reading profile.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /** Alias for {@link getProfile} — reads the profile by user id. */
  async getProfileByUserId(userId: string): Promise<Profile | null> {
    return this.getProfile(userId);
  }

  /**
   * Update the caller's profile. Only fields present on `input` are
   * mutated; absent fields are left untouched. Admin-only fields
   * (`account_status`, `subscription_plan`, `credits_balance`) cannot
   * be set through this method.
   *
   * @throws {ValidationError} if `username` is malformed (length / charset).
   * @throws {ConflictError} if `username` is already taken (case-insensitive).
   * @throws {NotFoundError} if the caller's profile does not exist.
   * @throws {DatabaseError} on any other Supabase failure.
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<Profile> {
    const updates = this.buildUpdatePayload(input);

    // Case-insensitive username uniqueness check. RLS on `profiles` is
    // owner-scoped, so a server client cannot see other users' rows —
    // we use the admin client for the lookup so the check is meaningful
    // regardless of which factory constructed this service.
    if (updates.username !== undefined && updates.username !== null) {
      await this.assertUsernameAvailable(updates.username, userId);
    }

    if (Object.keys(updates).length === 0) {
      // No-op: just return the current row (or 404 if missing).
      const current = await this.getProfile(userId);
      if (!current) throw new NotFoundError("Profile", userId);
      return current;
    }

    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select()
        .maybeSingle();

      if (error) {
        // 23505 = unique_violation (case-sensitive duplicate from the
        // `profiles.username` UNIQUE constraint). The case-insensitive
        // check above usually catches this first, but races are possible.
        if (error.code === "23505") {
          throw new ConflictError("Username is already taken.", {
            userId,
            cause: error.message,
          });
        }
        throw this.toDbError(error, "updateProfile failed");
      }
      if (!data) {
        throw new NotFoundError("Profile", userId);
      }
      return data;
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof ConflictError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure updating profile.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Set the caller's avatar URL. Used after a successful avatar upload
   * to the `avatars` storage bucket.
   *
   * @throws {ValidationError} if `avatarUrl` is empty.
   * @throws {NotFoundError} if the caller's profile does not exist.
   */
  async updateAvatar(userId: string, avatarUrl: string): Promise<Profile> {
    if (!avatarUrl || !avatarUrl.trim()) {
      throw new ValidationError("avatarUrl is required.");
    }

    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId)
        .select()
        .maybeSingle();

      if (error) throw this.toDbError(error, "updateAvatar failed");
      if (!data) throw new NotFoundError("Profile", userId);
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
      throw new DatabaseError("Unexpected failure updating avatar.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Mark the caller's email as verified. Called by the email-verification
   * callback after Supabase Auth confirms the email token.
   *
   * Returns silently if the profile does not exist (defensive — the auth
   * callback should still succeed even if the profile hasn't been
   * provisioned yet).
   */
  async markEmailVerified(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("profiles")
        .update({ email_verified: true })
        .eq("id", userId);

      if (error) throw this.toDbError(error, "markEmailVerified failed");
      logger.info("email marked verified", { userId });
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure marking email verified.",
        { userId, cause: appErr.message },
      );
    }
  }

  /**
   * Aggregate everything the user dashboard needs into a single response:
   *
   *   - `profile`                   — the caller's `profiles` row.
   *   - `settings`                  — the caller's `user_settings` row.
   *   - `unreadNotificationCount`   — count of unread `notifications`.
   *   - `recentActivity`            — last 10 `activity_logs` rows.
   *   - `recentNotifications`       — last 5 `notifications` rows.
   *   - `creditsBalance` / `plan`   — convenience fields from `profile`.
   *
   * Five queries are issued in parallel via `Promise.all` so the
   * round-trip cost is a single network RTT (Supabase batches them).
   *
   * @throws {NotFoundError} if the caller's profile or settings row is missing.
   * @throws {DatabaseError} on any other Supabase failure.
   */
  async getDashboardData(userId: string): Promise<DashboardData> {
    try {
      const [
        profileRes,
        settingsRes,
        unreadRes,
        activityRes,
        notificationsRes,
      ] = await Promise.all([
        this.supabase
          .from("profiles")
          .select()
          .eq("id", userId)
          .maybeSingle(),
        this.supabase
          .from("user_settings")
          .select()
          .eq("id", userId)
          .maybeSingle(),
        this.supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("is_read", false),
        this.supabase
          .from("activity_logs")
          .select()
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        this.supabase
          .from("notifications")
          .select()
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (profileRes.error) throw this.toDbError(profileRes.error, "dashboard: profile failed");
      if (settingsRes.error) throw this.toDbError(settingsRes.error, "dashboard: settings failed");
      if (unreadRes.error) throw this.toDbError(unreadRes.error, "dashboard: unread count failed");
      if (activityRes.error) throw this.toDbError(activityRes.error, "dashboard: activity failed");
      if (notificationsRes.error) throw this.toDbError(notificationsRes.error, "dashboard: notifications failed");

      if (!profileRes.data) {
        throw new NotFoundError("Profile", userId);
      }
      if (!settingsRes.data) {
        throw new NotFoundError("User settings", userId);
      }

      return {
        profile: profileRes.data,
        settings: settingsRes.data,
        unreadNotificationCount: unreadRes.count ?? 0,
        recentActivity: activityRes.data ?? [],
        recentNotifications: notificationsRes.data ?? [],
        creditsBalance: profileRes.data.credits_balance,
        plan: profileRes.data.subscription_plan,
      };
    } catch (err) {
      if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError(
        "Unexpected failure assembling dashboard data.",
        { userId, cause: appErr.message },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Validate `username` and verify it is not already taken by another
   * user (case-insensitive). Throws on invalid / taken.
   */
  private async assertUsernameAvailable(
    username: string,
    userId: string,
  ): Promise<void> {
    const normalized = username.trim().toLowerCase();
    if (normalized.length < USERNAME_MIN_LENGTH) {
      throw new ValidationError(
        `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
        { field: "username", value: username },
      );
    }
    if (normalized.length > USERNAME_MAX_LENGTH) {
      throw new ValidationError(
        `Username must be at most ${USERNAME_MAX_LENGTH} characters.`,
        { field: "username", value: username },
      );
    }
    if (!USERNAME_PATTERN.test(normalized)) {
      throw new ValidationError(
        "Username may only contain lowercase letters, digits, hyphens, and underscores (and must start with a letter or digit).",
        { field: "username", value: username },
      );
    }

    const admin = this.getAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", normalized)
      .neq("id", userId)
      .maybeSingle();

    if (error) {
      throw this.toDbError(error, "username availability lookup failed");
    }
    if (data) {
      throw new ConflictError("Username is already taken.", {
        userId,
        username: normalized,
      });
    }
  }

  /**
   * Lazily construct the admin Supabase client used for cross-user
   * lookups (currently only the username uniqueness check). The client
   * is a process-level singleton via {@link createSupabaseAdminClient}.
   */
  private getAdminClient(): AdminSupabaseClient {
    if (this._adminClient) return this._adminClient;
    this._adminClient = createSupabaseAdminClient();
    return this._adminClient;
  }

  /**
   * Translate {@link UpdateProfileInput} into a typed
   * `TablesUpdate<"profiles">` payload, validating each field.
   */
  private buildUpdatePayload(input: UpdateProfileInput): TablesUpdate<"profiles"> {
    const updates: TablesUpdate<"profiles"> = {};
    if (input.full_name !== undefined) updates.full_name = input.full_name;
    if (input.username !== undefined) updates.username = input.username;
    if (input.phone_number !== undefined) updates.phone_number = input.phone_number;
    if (input.country !== undefined) updates.country = input.country;
    if (input.time_zone !== undefined) updates.time_zone = input.time_zone;
    if (input.locale !== undefined) updates.locale = input.locale;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.company !== undefined) updates.company = input.company;
    if (input.job_title !== undefined) updates.job_title = input.job_title;
    if (input.website !== undefined) updates.website = input.website;
    return updates;
  }

  /** Map a Postgrest error into a {@link DatabaseError}. */
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
 * Build the canonical RLS-enforced `ProfileService` for use in
 * Server Components + Route Handlers. The caller's auth session is
 * propagated; only their own profile is mutable.
 */
export async function createProfileService(): Promise<ProfileService> {
  const supabase = await createSupabaseServerClient();
  return new ProfileService(supabase);
}

/**
 * Build an admin `ProfileService` that bypasses RLS. Use only for system
 * operations (e.g. provisioning profiles for migrated users, admin
 * moderation).
 */
export function createProfileServiceAdmin(): ProfileService {
  const supabase = createSupabaseAdminClient();
  return new ProfileService(supabase);
}
