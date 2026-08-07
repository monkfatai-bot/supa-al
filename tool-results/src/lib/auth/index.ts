/**
 * Supa AI — Auth barrel (Phase 1 + Phase 2).
 *
 * Single import surface for the auth layer:
 *
 * Phase 1 (existing):
 *   - Session helpers: {@link getSession}, {@link getCurrentUser}, {@link requireUserId}
 *   - RBAC helpers:    {@link can}, {@link canPlatform}, {@link hasPermission},
 *                      {@link isRole}, {@link isPlatformRole}
 *   - Shared types:    {@link AuthUser}, {@link AuthSession}, {@link Role},
 *                      {@link PlatformRole}, {@link Permission}, {@link SessionContext}
 *
 * Phase 2 (new):
 *   - ProfileService           — rich profile reads/updates + dashboard aggregation.
 *   - UserSettingsService      — preferences, notifications, privacy, session timeout.
 *   - SessionService           — multi-device session tracking + revocation.
 *   - NotificationService      — in-app notifications feed.
 *   - ActivityLogService       — audit trail (admin client, best-effort writes).
 *   - AccountService           — GDPR account deletion + data export.
 *   - LinkedAccountsService    — OAuth provider connections.
 *   - helpers                  — parseUserAgent, getClientIp, sanitizeMetadata.
 *
 * @module @/lib/auth
 */
// Phase 1 — session + RBAC.
export {
  getSession,
  getCurrentUser,
  requireUserId,
  type AuthUser,
  type AuthSession,
  type SessionContext,
} from "@/lib/auth/session";

export {
  can,
  canPlatform,
  hasPermission,
  isRole,
  isPlatformRole,
  ROLES,
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  type Role,
  type PlatformRole,
  type Permission,
  type PermissionActor,
} from "@/lib/auth/permissions";

// Phase 2 — profile.
export {
  ProfileService,
  createProfileService,
  createProfileServiceAdmin,
  type Profile,
  type UpdateProfileInput,
  type DashboardData,
} from "@/lib/auth/profile";

// Phase 2 — user settings.
export {
  UserSettingsService,
  createSettingsService,
  type UserSettings,
  type UpdateSettingsInput,
} from "@/lib/auth/settings";

// Phase 2 — sessions.
export {
  SessionService,
  createSessionService,
  createSessionServiceAdmin,
  type UserSession,
  type RecordSessionInput,
} from "@/lib/auth/sessions";

// Phase 2 — notifications.
export {
  NotificationService,
  createNotificationService,
  createNotificationServiceAdmin,
  type Notification,
  type NotificationType,
  type CreateNotificationInput,
  type ListNotificationsOptions,
} from "@/lib/auth/notifications";

// Phase 2 — activity logs.
export {
  ActivityLogService,
  createActivityLogService,
  type ActivityLog,
  type ActivityEventType,
  type ActivitySeverity,
  type LogOptions,
} from "@/lib/auth/activity";

// Phase 2 — account management.
export {
  AccountService,
  createAccountService,
  type AccountDeletionRequest,
  type DataExportDocument,
} from "@/lib/auth/account";

// Phase 2 — linked accounts.
export {
  LinkedAccountsService,
  createLinkedAccountsService,
  createLinkedAccountsServiceAdmin,
  type LinkedAccount,
  type LinkedAccountProvider,
  type LinkAccountInput,
} from "@/lib/auth/linked-accounts";

// Phase 2 — shared helpers.
export {
  parseUserAgent,
  getClientIp,
  sanitizeMetadata,
  type AnySupabaseClient,
  type ParsedUserAgent,
} from "@/lib/auth/helpers";
