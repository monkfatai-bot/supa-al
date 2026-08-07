/**
 * Supa AI — shared primitive types.
 *
 * Cross-cutting primitives used by every layer of the platform: branded IDs,
 * date/timestamp aliases, the `Result<T,E>` discriminated union for explicit
 * error handling, pagination contracts, and small generic helpers.
 *
 * Keeping these here — rather than scattered across feature modules — gives
 * us a single canonical vocabulary the rest of the codebase can import from
 * `@/types`.
 *
 * @module @/types/common
 */

import type { $brand } from "zod";

/**
 * Nominal branding helper. Produces a structurally-identical-but-nominally-
 * distinct variant of `T`, tagged with the literal `B`. Use this to prevent
 * accidentally passing a plain `string` where a typed `ID` is expected.
 */
export type Branded<T, B extends string> = T & $brand<B>;

/**
 * Opaque resource identifier. A non-empty string branded as an `"ID"` so it
 * cannot be silently swapped with arbitrary text. Validate via `idSchema`
 * from `@/lib/validation/common` to safely coerce a `string` into an `ID`.
 */
export type ID = Branded<string, "ID">;

/**
 * RFC 4122 UUID (v4/v7). Branded to keep it distinct from generic strings.
 * Validate via `uuidSchema` from `@/lib/validation/common`.
 */
export type UUID = Branded<string, "UUID">;

/** ISO-8601 date string (e.g. `2024-01-15T12:34:56.000Z`). */
export type ISODateString = string;

/** Unix epoch milliseconds. */
export type Timestamp = number;

/** `T | null | undefined` — the optional/absent shape used across DTOs. */
export type Maybe<T> = T | null | undefined;

/**
 * Discriminated union for explicit, try/catch-free error handling.
 *
 * ```ts
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) return { ok: false, error: "divide-by-zero" };
 *   return { ok: true, value: a / b };
 * }
 * ```
 */
export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** `Promise<Result<T, E>>` — the async counterpart of {@link Result}. */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/** Sort direction for paginated queries. */
export type SortDirection = "asc" | "desc";

/**
 * Pagination input accepted by list endpoints. Defaults: `limit = 20`,
 * capped at `100`. `cursor` is opaque — callers should treat it as a token
 * returned by the previous page.
 */
export interface PaginationParams {
  /** Number of items per page. 1–100. Default 20. */
  limit?: number;
  /** Opaque cursor returned in the previous {@link PaginatedResult}. */
  cursor?: string;
  /** Sort direction. Defaults to server-chosen order when omitted. */
  sort?: SortDirection;
  /** Field name to sort by. Servers should validate against an allow-list. */
  sortBy?: string;
}

/**
 * Paginated response envelope. `nextCursor` is `null` when there are no
 * more pages; `hasMore` is the boolean convenience flag for UI.
 */
export interface PaginatedResult<T> {
  items: T[];
  nextCursor: Maybe<string>;
  hasMore: boolean;
  /** Total count, when cheap to compute. Omit for cursor-only pagination. */
  total?: number;
}
