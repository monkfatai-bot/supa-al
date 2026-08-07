/**
 * Supa AI — Error hierarchy.
 *
 * Every domain error extends {@link AppError}, which carries a stable
 * `code`, an HTTP-compatible `statusCode`, and a serializable `details`
 * payload. This lets API routes, Server Actions, and the UI all map errors
 * to consistent responses without instanceof chains leaking across layers.
 *
 * @module @/lib/errors
 */

/** Canonical error codes used across the platform. */
export type ErrorCode =
  | "CONFIGURATION_ERROR"
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND_ERROR"
  | "CONFLICT_ERROR"
  | "RATE_LIMIT_ERROR"
  | "PAYMENT_ERROR"
  | "AI_PROVIDER_ERROR"
  | "DATABASE_ERROR"
  | "STORAGE_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "INTERNAL_ERROR";

/** Serializable context attached to an error for logging + clients. */
export interface ErrorDetails {
  [key: string]: unknown;
}

interface AppErrorOptions {
  code?: ErrorCode;
  statusCode?: number;
  details?: ErrorDetails;
  cause?: unknown;
  /** When false, the message is safe to expose to clients. Defaults to true. */
  internal?: boolean;
}

/**
 * Base class for all Supa AI errors. Never throw raw `Error` in domain code.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details: ErrorDetails;
  readonly internal: boolean;

  constructor(
    message: string,
    options: AppErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details ?? {};
    this.internal = options.internal ?? true;
    // Restore prototype chain for ES5 transpilation targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Convert to a JSON-safe object for API responses + logging. */
  toJSON(): {
    name: string;
    code: ErrorCode;
    message: string;
    statusCode: number;
    details: ErrorDetails;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/** Boot-time configuration problems (missing/invalid env, bad config files). */
export class ConfigurationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "CONFIGURATION_ERROR",
      statusCode: 500,
      details,
      internal: true,
    });
  }
}

/** Input failed Zod validation. */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details,
      internal: false,
    });
  }
}

/** Unauthenticated request (no/invalid credentials). */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required.", details?: ErrorDetails) {
    super(message, {
      code: "AUTHENTICATION_ERROR",
      statusCode: 401,
      details,
      internal: false,
    });
  }
}

/** Authenticated but not permitted. */
export class AuthorizationError extends AppError {
  constructor(message = "You are not authorized to perform this action.", details?: ErrorDetails) {
    super(message, {
      code: "AUTHORIZATION_ERROR",
      statusCode: 403,
      details,
      internal: false,
    });
  }
}

/** Resource not found. */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number, details?: ErrorDetails) {
    const message =
      id !== undefined
        ? `${resource} with id "${id}" was not found.`
        : `${resource} was not found.`;
    super(message, {
      code: "NOT_FOUND_ERROR",
      statusCode: 404,
      details,
      internal: false,
    });
  }
}

/** Unique constraint / duplicate resource. */
export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "CONFLICT_ERROR",
      statusCode: 409,
      details,
      internal: false,
    });
  }
}

/** Rate limit exceeded. `retryAfter` is seconds. */
export class RateLimitError extends AppError {
  readonly retryAfter: number;
  constructor(message = "Rate limit exceeded.", retryAfter = 60, details?: ErrorDetails) {
    super(message, {
      code: "RATE_LIMIT_ERROR",
      statusCode: 429,
      details: { ...details, retryAfter },
      internal: false,
    });
    this.retryAfter = retryAfter;
  }
}

/** Payment provider (Stripe/Paystack/Flutterwave) failure. */
export class PaymentError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "PAYMENT_ERROR",
      statusCode: 402,
      details,
      internal: false,
    });
  }
}

/** Upstream AI provider failure. */
export class AIProviderError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "AI_PROVIDER_ERROR",
      statusCode: 502,
      details,
      internal: false,
    });
  }
}

/** Database (Supabase/Postgres) failure. */
export class DatabaseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "DATABASE_ERROR",
      statusCode: 500,
      details,
      internal: true,
    });
  }
}

/** Supabase Storage failure. */
export class StorageError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "STORAGE_ERROR",
      statusCode: 500,
      details,
      internal: true,
    });
  }
}

/** Generic upstream service failure. */
export class ExternalServiceError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: "EXTERNAL_SERVICE_ERROR",
      statusCode: 502,
      details,
      internal: true,
    });
  }
}

/**
 * Normalize any thrown value into an {@link AppError}. Unknown values become
 * `INTERNAL_ERROR` so unexpected crashes never leak internals to clients.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message, {
      code: "INTERNAL_ERROR",
      cause: error,
      internal: true,
    });
  }
  return new AppError("An unexpected error occurred.", {
    code: "INTERNAL_ERROR",
    details: { raw: String(error) },
    internal: true,
  });
}
