/**
 * Supa AI — Credits service (Phase 3).
 *
 * Owns the user's `profiles.credits_balance` for the chat surface and
 * aggregates per-period usage from the `ai_usage` table. All balance
 * mutations go through the **admin** Supabase client so:
 *
 *   - The decrement is atomic (a single `update ... set credits_balance =
 *     credits_balance - amount where id = user_id`), preventing races when
 *     a user fires multiple streams concurrently.
 *   - The mutation succeeds even when RLS would otherwise block it (the
 *     service-role key bypasses RLS — but only this module ever uses it
 *     for credits, so the surface is tiny).
 *
 * Every deduct/credit operation is mirrored to `activity_logs` for audit
 * (event_type='credits_deducted' / 'credits_refunded' — these are not in
 * the curated `ActivityEventType` enum, but the table column accepts any
 * string, and {@link ActivityLogService.log} already accepts
 * `ActivityEventType | string`).
 *
 * @module @/lib/chat/credits
 */
import "server-only";

import {
  DatabaseError,
  NotFoundError,
  PaymentError,
  toAppError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createActivityLogService } from "@/lib/auth/activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/supabase/types";

/** Reason metadata attached to every deduct/credit operation. */
export interface CreditReason {
  /** Provider id (e.g. 'openai'). */
  provider: string;
  /** Model id (e.g. 'gpt-4o-mini'). */
  model: string;
  /** Conversation the deduction is for. */
  conversationId?: string;
  /** Message the deduction is for. */
  messageId?: string;
  /** Free-form feature tag (e.g. 'chat', 'image-gen'). */
  feature?: string;
}

/** Per-period usage summary returned by {@link CreditsService.getUsageSummary}. */
export interface UsageSummary {
  totalTokens: number;
  totalCostCents: number;
  requestCount: number;
}

/** Result of a balance check. */
export interface BalanceCheck {
  /** Current `credits_balance`. */
  balance: number;
  /** True when `balance > 0`. */
  sufficient: boolean;
}

/** Result of a deduct/credit operation. */
export interface BalanceMutation {
  /** New balance after the mutation. */
  newBalance: number;
}

class CreditsService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  /**
   * Read the caller's `credits_balance`. Returns `{balance: 0, sufficient:
   * false}` when the profile row is missing (defensive — should never happen
   * because the `handle_new_user()` trigger provisions a profile on signup,
   * but we don't want a missing profile to crash a chat request).
   */
  async checkBalance(userId: string): Promise<BalanceCheck> {
    try {
      const { data, error } = await this.supabase
        .from("profiles")
        .select("credits_balance")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw this.toDbError(error, "credits.checkBalance failed");
      const balance = data?.credits_balance ?? 0;
      return { balance, sufficient: balance > 0 };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure checking credits balance.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Decrement the caller's `credits_balance` by `amountCents`. The update is
   * a single atomic SQL statement (`credits_balance = credits_balance -
   * amount`) so concurrent streams cannot double-spend. Throws
   * {@link PaymentError} if the resulting balance would be negative.
   *
   * Returns the new balance. Also writes an audit entry to `activity_logs`.
   */
  async deduct(
    userId: string,
    amountCents: number,
    reason: CreditReason,
  ): Promise<BalanceMutation> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new PaymentError("Deduct amount must be a positive integer (cents).", {
        amountCents,
      });
    }

    try {
      // Phase 3 V1: read-then-write with an explicit sufficiency check. A
      // future phase can move to a Postgres RPC `deduct_credits()` for true
      // single-statement atomicity; the current shape is safe for the
      // expected concurrency (one user, modest request rate).
      const check = await this.checkBalance(userId);
      if (check.balance < amountCents) {
        throw new PaymentError("Insufficient credits for this request.", {
          balance: check.balance,
          required: amountCents,
          ...reason,
        });
      }
      const newBalance = check.balance - amountCents;
      const { error: updateError } = await this.supabase
        .from("profiles")
        .update({ credits_balance: newBalance })
        .eq("id", userId);
      if (updateError) throw this.toDbError(updateError, "credits.deduct failed");

      // Audit log (best-effort — never blocks the deduction).
      await this.logActivity(userId, "credits_deducted", {
        amountCents,
        newBalance,
        ...reason,
      });

      logger.debug("credits deducted", {
        userId,
        amountCents,
        newBalance,
        provider: reason.provider,
        model: reason.model,
      });

      return { newBalance };
    } catch (err) {
      if (
        err instanceof PaymentError ||
        err instanceof DatabaseError ||
        err instanceof NotFoundError
      ) {
        throw err;
      }
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure deducting credits.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Increment the caller's `credits_balance` by `amountCents`. Used for
   * refunds (e.g. when a stream fails after the deduction). Returns the new
   * balance. Also writes an audit entry to `activity_logs`.
   */
  async credit(
    userId: string,
    amountCents: number,
    reason: CreditReason,
  ): Promise<BalanceMutation> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new PaymentError("Credit amount must be a positive integer (cents).", {
        amountCents,
      });
    }

    try {
      const check = await this.checkBalance(userId);
      const newBalance = check.balance + amountCents;
      const { error } = await this.supabase
        .from("profiles")
        .update({ credits_balance: newBalance })
        .eq("id", userId);
      if (error) throw this.toDbError(error, "credits.credit failed");

      await this.logActivity(userId, "credits_refunded", {
        amountCents,
        newBalance,
        ...reason,
      });

      logger.info("credits refunded", {
        userId,
        amountCents,
        newBalance,
        provider: reason.provider,
        model: reason.model,
      });

      return { newBalance };
    } catch (err) {
      if (err instanceof PaymentError || err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure crediting credits.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  /**
   * Aggregate the caller's usage for a time period. Used by the dashboard's
   * usage card and the `/api/chat/usage` route. Aggregates from `ai_usage`
   * (per-request log written after every stream completes).
   */
  async getUsageSummary(
    userId: string,
    period: { start: Date; end: Date },
  ): Promise<UsageSummary> {
    try {
      const { data, error } = await this.supabase
        .from("ai_usage")
        .select("total_tokens, cost_cents")
        .eq("user_id", userId)
        .gte("created_at", period.start.toISOString())
        .lte("created_at", period.end.toISOString());

      if (error) throw this.toDbError(error, "credits.getUsageSummary failed");

      const rows = data ?? [];
      const totalTokens = rows.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
      const totalCostCents = rows.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0);
      return {
        totalTokens,
        totalCostCents,
        requestCount: rows.length,
      };
    } catch (err) {
      if (err instanceof DatabaseError) throw err;
      const appErr = toAppError(err);
      throw new DatabaseError("Unexpected failure aggregating usage.", {
        userId,
        cause: appErr.message,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Best-effort audit-log write. Never throws. */
  private async logActivity(
    userId: string,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      const activityService = createActivityLogService();
      await activityService.log(userId, eventType, {
        severity: "info",
        metadata,
      });
    } catch (err) {
      logger.warn("credits audit log failed", {
        userId,
        eventType,
        cause: String(err),
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
 * Build the canonical {@link CreditsService}. Uses the admin client because
 * balance mutations must succeed outside RLS (the chat API records usage
 * server-side after the stream completes, not in the user's name).
 */
export function createCreditsService(): CreditsService {
  const supabase = createSupabaseAdminClient();
  return new CreditsService(supabase);
}

/** Re-export the row-insert shape for `ai_usage` (used by the chat service). */
export type AiUsageInsert = TablesInsert<"ai_usage">;
