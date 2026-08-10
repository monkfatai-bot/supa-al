/**
 * Application-wide constants.
 * Centralised so every module imports from one place.
 */

export const ROUTES = {
  HOME: "/",
  LOGIN: "/auth/login",
  SIGNUP: "/auth/signup",
  FORGOT_PASSWORD: "/auth/forgot-password",
  RESET_PASSWORD: "/auth/reset-password",
  VERIFY_EMAIL: "/auth/verify-email",
  AUTH_CALLBACK: "/auth/callback",
  DASHBOARD: "/dashboard",
  CHAT: "/chat",
  CONTENT: "/content",
  IMAGE: "/image",
  VIDEO: "/video",
  VOICE: "/voice",
  WORKSPACE: "/workspace",
  BUSINESS: "/business",
  AUTOMATION: "/automation",
  EMPLOYEES: "/employees",
  WORKFLOW_BUILDER: "/automation/workflows",
} as const;

export const API_ROUTES = {
  HEALTH: "/api/health",
  AUTOMATION_TICK: "/api/automation/tick",
} as const;

/**
 * Pagination defaults used across list endpoints.
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/**
 * HTTP status codes we reference explicitly in error handling.
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
