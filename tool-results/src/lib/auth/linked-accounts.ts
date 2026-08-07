/**
 * Supa AI — Linked accounts service (Phase 2).
 *
 * Owns the `linked_accounts` table — the catalog of authentication
 * providers connected to a user (Google, GitHub, Microsoft, Apple, plus
 * the primary `email` row provisioned at signup). The "Connected
 * Accounts" UI in Settings reads/writes through this service.
 *
 * RLS: every policy is owner-scoped (`user_id = auth.uid()`). The
 * canonical {@link createLinkedAccountsService} factory wires the RLS-
 * enforced server client.
 *
 * @module @/lib/auth/linked-accounts
 */
import "server-only";

import {
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  Tables,
  TablesInsert,
} from "@/lib/supabase/types";

import type { AnySupabaseClient } from "@/lib/auth/helpers";

/** Row shape for the `linked_accounts` table. */
export type LinkedAccount = Tables<"linked_accounts">;

/**
 * OAuth provider identifiers supported by the platform. `email` is special —
 * it is provisioned automatically by the `handle_new_user()` trigger and
 * cannot be unlinked (the user must delete their account instead).
 */
export type LinkedAccountProvider =
  | "google"
  | "github"
  | "microsoft"
  | "apple"
  | "email";

/** Input for {@link LinkedAccountsService.link}. */
export interface LinkAccountInput {
  /** Provider's user id (their `sub` claim on Google, numeric id on GitHub, etc.). */
  providerAccountId?: string | null;
  /** Email reported by the provider. */
  providerEmail?: string | null;
  /** Optional JSON-safe metadata (e.g. `{ scopes: ["read:user"] }`). */
  metadata?: Record<string, unknown> | null;
}

/** The `email` provider cannot be unlinked. */
const PRIMARY_PROVIDER: LinkedAccountProvider = "email";

/**
 * Service object encapsulating all `linked_accounts` operations. Constructed
 * with a typed Supabase client (server or admin).
 */
export class LinkedAccountsService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /** List every linked account for the caller. */
  async list(userId: string): Promise<LinkedAccount[]> {
    try {
      const { data, error } = await this.supabase
        .from("linked_accounts")
        .select()
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) throw this.toDbError(error, "linked_accounts list failed");
      return data ?? [];
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure listing linked accounts.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Link a new provider to the caller's account.
   *
   * @throws {ValidationError} if `provider` is missing.
   * @throws {ConflictError} if the provider is already linked to this user.
   * @throws {DatabaseError} on any other Supabase failure.
   */
  async link(
    userId: string,
    provider: LinkedAccountProvider | string,
    opts: LinkAccountInput = {},
  ): Promise<LinkedAccount> {
    if (!provider || typeof provider !== "string") {
      throw new ValidationError("Provider is required.");
    }

    const insert: TablesInsert<"linked_accounts"> = {
      user_id: userId,
      provider,
      provider_account_id: opts.providerAccountId ?? null,
      provider_email: opts.providerEmail ?? null,
      metadata: (opts.metadata ?? null) as TablesInsert<"linked_accounts">["metadata"],
    };

    try {
      const { data, error } = await this.supabase
        .from("linked_accounts")
        .insert(insert)
        .select()
        .single();

      if (error) {
        // 23505 = unique_violation on (user_id, provider)
        if (error.code === "23505") {
          throw new ConflictError(
            `Provider "${provider}" is already linked to this account.`,
            { userId, provider },
          );
        }
        throw this.toDbError(error, "linked_accounts insert failed");
      }
      if (!data) {
        throw new DatabaseError("linked_accounts insert returned no row.", {
          userId,
        });
      }
      return data;
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof ConflictError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure linking account.", {
        userId,
        provider,
        cause: appErr.message,
      });
    }
  }

  /**
   * Unlink a provider from the caller's account. The primary `email`
   * provider cannot be unlinked — the caller must delete their account
   * instead (see {@link AccountService.deleteAccount}).
   *
   * @throws {ValidationError} if `provider === "email"`.
   * @throws {NotFoundError} if the provider is not linked to this user.
   */
  async unlink(
    userId: string,
    provider: LinkedAccountProvider | string,
  ): Promise<void> {
    if (!provider || typeof provider !== "string") {
      throw new ValidationError("Provider is required.");
    }
    if (provider === PRIMARY_PROVIDER) {
      throw new ValidationError(
        "The primary email provider cannot be unlinked. Delete your account instead.",
        { provider },
      );
    }

    try {
      const { data, error } = await this.supabase
        .from("linked_accounts")
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider)
        .select("id")
        .maybeSingle();

      if (error) throw this.toDbError(error, "linked_accounts delete failed");
      if (!data) {
        throw new NotFoundError("Linked account", provider, { userId });
      }
    } catch (err) {
      if (
        err instanceof DatabaseError ||
        err instanceof NotFoundError ||
        err instanceof ValidationError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure unlinking account.", {
        userId,
        provider,
        cause: appErr.message,
      });
    }
  }

  /** Predicate: is `provider` linked to the caller's account? */
  async isLinked(
    userId: string,
    provider: LinkedAccountProvider | string,
  ): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from("linked_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle();

      if (error) throw this.toDbError(error, "isLinked lookup failed");
      return data !== null;
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure checking linked account.", {
        userId,
        provider,
        cause: appErr.message,
      });
    }
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
 * Build the canonical RLS-enforced `LinkedAccountsService` for use in
 * Server Components + Route Handlers. Only the caller's linked accounts
 * are reachable.
 */
export async function createLinkedAccountsService(): Promise<LinkedAccountsService> {
  const supabase = await createSupabaseServerClient();
  return new LinkedAccountsService(supabase);
}

/**
 * Build an admin `LinkedAccountsService` that bypasses RLS. Use only for
 * system operations (e.g. provisioning the `email` row during signup).
 */
export function createLinkedAccountsServiceAdmin(): LinkedAccountsService {
  const supabase = createSupabaseAdminClient();
  return new LinkedAccountsService(supabase);
}
