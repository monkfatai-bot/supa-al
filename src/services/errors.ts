import { HTTP_STATUS } from "@/config/constants";

/**
 * Standard application error that maps cleanly to HTTP responses.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_ERROR,
    code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Factory helpers for common error types.
 */
export const Errors = {
  badRequest: (message = "Bad request") =>
    new AppError(message, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST"),

  unauthorized: (message = "Unauthorized") =>
    new AppError(message, HTTP_STATUS.UNAUTHORIZED, "UNAUTHORIZED"),

  forbidden: (message = "Forbidden") =>
    new AppError(message, HTTP_STATUS.FORBIDDEN, "FORBIDDEN"),

  notFound: (message = "Not found") =>
    new AppError(message, HTTP_STATUS.NOT_FOUND, "NOT_FOUND"),

  internal: (message = "Internal server error") =>
    new AppError(message, HTTP_STATUS.INTERNAL_ERROR, "INTERNAL_ERROR"),
} as const;

/**
 * Type guard to check if an unknown value is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
