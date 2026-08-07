/**
 * Supa AI — API envelope + HTTP metadata types.
 *
 * Every REST route in the platform returns a {@link ApiResponse} envelope so
 * clients can rely on a single parsing strategy: branch on `success`, then
 * read either `data` or `error`. The envelope also carries an optional
 * {@link ApiMeta} block for request IDs, timestamps, and pagination.
 *
 * @module @/types/api
 */

import type { PaginatedResult } from "./common";

/** HTTP methods used by the API surface. */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Canonical HTTP status codes used across the platform. Exposed as a
 * `const` object so callers can reference `HTTP_STATUS.NOT_FOUND` rather
 * than the magic number `404`, while `HttpStatusCode` preserves the
 * finite union of allowed values for type narrowing.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/** Finite union of allowed HTTP status codes. */
export type HttpStatusCode =
  (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

/** Optional metadata attached to every API response. */
export interface ApiMeta {
  /** Correlation ID for tracing across services. */
  requestId?: string;
  /** ISO-8601 timestamp of the response. */
  timestamp?: string;
  /** Populated for paginated list endpoints. */
  pagination?: {
    nextCursor?: string | null;
    hasMore: boolean;
    total?: number;
  };
  /** Open extension point for ad-hoc metadata (rate-limit info, etc.). */
  [key: string]: unknown;
}

/** Serializable error payload embedded in a failed {@link ApiResponse}. */
export interface ApiError {
  /** Stable error code (e.g. `VALIDATION_ERROR`). See `@/lib/errors`. */
  code: string;
  /** Human-readable message, safe to surface to clients. */
  message: string;
  /** Optional structured details (field errors, hints, etc.). */
  details?: Record<string, unknown>;
}

/**
 * Standard API response envelope.
 *
 * ```ts
 * // Success
 * const ok: ApiResponse<User> = { success: true, data: user, meta: { requestId } };
 * // Failure
 * const err: ApiResponse<User> = {
 *   success: false,
 *   error: { code: "NOT_FOUND_ERROR", message: "User not found." },
 * };
 * ```
 */
export type ApiResponse<T> =
  | { success: true; data: T; meta?: ApiMeta }
  | { success: false; error: ApiError; meta?: ApiMeta };

/**
 * Convenience alias for a successful list response that already wraps
 * {@link PaginatedResult}. Useful for typed list endpoints.
 */
export type ApiListResponse<T> = ApiResponse<PaginatedResult<T>>;
