/**
 * Supa AI — Phase 10 Business AI Suite — core helpers (server-only).
 *
 * Re-exports the workspace enforcement helpers (`assertMember`, `assertRole`,
 * `assertCanWrite`, `assertCanAdmin`, `toDbError`, `wrapUnexpected`,
 * `WRITE_ROLES`, `ADMIN_ROLES`) from `@/lib/workspace/core` so every Phase 10
 * service can import everything it needs from a single barrel.
 *
 * Adds the {@link nextNumber} helper used by the invoice / quotation /
 * receipt / purchase-order services to generate per-workspace sequence
 * numbers (e.g. `INV-0001`, `QUO-0001`, `REC-0001`, `PO-0001`).
 *
 * @module @/lib/business/core
 */
import "server-only";

import type { AnySupabaseClient } from "@/lib/auth/helpers";

// Re-export everything the services need from the workspace core so they
// can `import { ... } from "@/lib/business/core"` and stay narrow.
export {
  assertMember,
  assertRole,
  assertCanWrite,
  assertCanAdmin,
  findMembership,
  slugify,
  toJson,
  toDbError,
  wrapUnexpected,
  notFound,
  validationError,
  WRITE_ROLES,
  ADMIN_ROLES,
  type PostgrestErrorLike,
} from "@/lib/workspace/core";

// Re-export the error classes too — services construct these directly.
export {
  AuthorizationError,
  DatabaseError,
  NotFoundError,
  ValidationError,
} from "@/lib/workspace/core";

// ---------------------------------------------------------------------------
// Auto-numbering helper
// ---------------------------------------------------------------------------

/** Numeric prefix kinds supported by {@link nextNumber}. */
export type NumberKind = "INV" | "QUO" | "REC" | "PO" | "EST";

/** Shape of the `count(*)` row returned by the Postgrest `head: true` call. */
interface CountRow {
  count: number | null;
}

/**
 * Generate the next sequence number for a workspace-scoped document
 * (invoices, quotations, receipts, purchase orders). Format:
 *
 *   `<PREFIX>-<YYYY>-<NNNN>`
 *
 * where `NNNN` is the zero-padded count of existing rows of the same
 * kind in the same workspace + year, +1.
 *
 * The lookup is best-effort — it does NOT run inside a transaction, so a
 * race between two concurrent inserts can produce a duplicate sequence
 * number. The unique constraint on `(workspace_id, number)` will reject
 * the second insert; the caller should retry with a fresh number.
 *
 * The `table` parameter accepts the canonical Postgres table name (e.g.
 * `"invoices"`, `"quotations"`, `"receipts"`, `"purchase_orders"`).
 */
export async function nextNumber(
  supabase: AnySupabaseClient,
  workspaceId: string,
  table:
    | "invoices"
    | "quotations"
    | "receipts"
    | "purchase_orders",
  prefix: NumberKind,
  opts?: { year?: number; tz?: "UTC" },
): Promise<string> {
  const year = opts?.year ?? new Date().getUTCFullYear();
  // Count rows that already exist in this workspace for this year. The
  // `issue_date` column exists on invoices + purchase_orders; `payment_date`
  // is timestamptz on receipts; `created_at` is the only date column on
  // quotations — use that.
  const dateColumn =
    table === "receipts"
      ? "payment_date"
      : table === "quotations"
        ? "created_at"
        : "issue_date";

  const yearStartIso = `${year}-01-01T00:00:00.000Z`;
  const yearEndIso = `${year}-12-31T23:59:59.999Z`;

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte(dateColumn, yearStartIso)
    .lte(dateColumn, yearEndIso);

  if (error) {
    // Don't crash the create flow — fall back to a random suffix so the
    // caller can still produce a unique (likely) number.
    const fallback = Math.floor(Math.random() * 9000 + 1000);
    return `${prefix}-${year}-${String(fallback).padStart(4, "0")}`;
  }

  const next = ((count ?? 0) as number) + 1;
  void (opts?.tz ?? "UTC");
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

/**
 * Compute the total / subtotal / tax / discount for a set of line items.
 * Used by the invoice / quotation / PO services before insert so the
 * row is always internally consistent.
 *
 *   subtotal = sum(item.quantity * item.unitPrice)
 *   total    = max(0, subtotal + tax - discount)
 */
export function computeLineTotals(
  items: Array<{
    quantity: number;
    unitPrice: number;
    total?: number;
  }>,
  opts?: { tax?: number; discount?: number },
): { subtotal: number; tax: number; discount: number; total: number } {
  const subtotal = items.reduce(
    (sum, item) => sum + (Number(item.total ?? item.quantity * item.unitPrice) || 0),
    0,
  );
  const tax = Math.max(0, Number(opts?.tax ?? 0));
  const discount = Math.max(0, Number(opts?.discount ?? 0));
  const total = Math.max(0, subtotal + tax - discount);
  return { subtotal, tax, discount, total };
}

/** Cast a CountRow-shaped Postgrest response into a safe number. */
export function safeCount(row: CountRow | null): number {
  return Number(row?.count ?? 0);
}
