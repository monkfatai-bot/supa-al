/**
 * Supa AI — Role-Based Access Control (RBAC) policy.
 *
 * Two role dimensions:
 *
 *   1. **Org roles** ({@link Role}) — assigned per-org via
 *      `organization_members.role`. Govern collaboration within a workspace.
 *   2. **Platform roles** ({@link PlatformRole}) — assigned globally via
 *      `users.platform_role`. Govern account-level capabilities (plan tier,
 *      admin access, premium features).
 *
 * The policy table is the single source of truth: every privileged operation
 * in the app must `if (!canPlatform(role, 'permission:verb')) throw
 * AuthorizationError`.
 *
 * @module @/lib/auth/permissions
 */

// ---------------------------------------------------------------------------
// Org-level roles (Phase 1 — unchanged)
// ---------------------------------------------------------------------------

/** Org-level role assigned to a user via `organization_members.role`. */
export type Role = "owner" | "admin" | "member" | "viewer";

/** All assignable org roles. Useful for iteration / validation. */
export const ROLES: readonly Role[] = ["owner", "admin", "member", "viewer"] as const;

// ---------------------------------------------------------------------------
// Platform-level roles (Phase 2 — 6 roles per spec)
// ---------------------------------------------------------------------------

/**
 * Platform-level role assigned globally via `users.platform_role`.
 *
 * Hierarchy (most → least privileged):
 *   - `super_admin`   — full platform control (Supa AI staff).
 *   - `admin`         — platform administration (support, moderation).
 *   - `team_owner`    — owns a team/workspace, can manage members + billing.
 *   - `team_member`   — belongs to a team, can use shared resources.
 *   - `premium_user`  — paid individual plan, access to premium AI features.
 *   - `free_user`     — free tier, limited usage.
 */
export type PlatformRole =
  | "super_admin"
  | "admin"
  | "team_owner"
  | "team_member"
  | "premium_user"
  | "free_user";

/** All assignable platform roles. */
export const PLATFORM_ROLES: readonly PlatformRole[] = [
  "super_admin",
  "admin",
  "team_owner",
  "team_member",
  "premium_user",
  "free_user",
] as const;

/**
 * Canonical permission strings. Newline-grouped by domain so additions stay
 * readable. Each permission maps 1:1 to a privileged action.
 */
export type Permission =
  // Organization ---------------------------------------------------------
  | "org:read"
  | "org:update"
  | "org:delete"
  | "org:members:read"
  | "org:members:manage"
  // AI -------------------------------------------------------------------
  | "ai:read"
  | "ai:chat"
  | "ai:image:generate"
  | "ai:video:generate"
  | "ai:voice:generate"
  | "ai:business:use"
  | "ai:marketing:use"
  // Files / Storage ------------------------------------------------------
  | "file:read"
  | "file:upload"
  | "file:delete"
  // API Keys -------------------------------------------------------------
  | "api_key:read"
  | "api_key:manage"
  // Billing / Subscriptions ---------------------------------------------
  | "billing:read"
  | "billing:manage"
  // Usage analytics ------------------------------------------------------
  | "usage:read"
  // Admin (Phase 2) ------------------------------------------------------
  | "admin:read"
  | "admin:users:manage"
  | "admin:system:manage"
  // Account (Phase 2) ----------------------------------------------------
  | "account:read"
  | "account:update"
  | "account:delete"
  | "account:export:data"
  | "integration:read"
  | "integration:install"
  | "integration:manage"
  | "integration:publish";

/**
 * Role → permission map. Frozen at module load so a stray mutation can never
 * silently widen access.
 *
 * Design intent:
 *   - `owner`  — full control, including deleting the org and changing plans.
 *   - `admin`  — day-to-day management (members, files, AI, billing:read) but
 *                cannot delete the org or change the billing plan.
 *   - `member` — productive user: chat, upload, manage own API keys, read
 *                usage.
 *   - `viewer` — read-only collaborator: can read conversations, files, and
 *                org info, but cannot create or mutate anything.
 */
const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> =
  Object.freeze({
    owner: new Set<Permission>([
      "org:read",
      "org:update",
      "org:delete",
      "org:members:read",
      "org:members:manage",
      "ai:read",
      "ai:chat",
      "ai:image:generate",
      "file:read",
      "file:upload",
      "file:delete",
      "api_key:read",
      "api_key:manage",
      "billing:read",
      "billing:manage",
      "usage:read",
    ]),
    admin: new Set<Permission>([
      "org:read",
      "org:update",
      "org:members:read",
      "org:members:manage",
      "ai:read",
      "ai:chat",
      "ai:image:generate",
      "file:read",
      "file:upload",
      "file:delete",
      "api_key:read",
      "api_key:manage",
      "billing:read",
      "usage:read",
    ]),
    member: new Set<Permission>([
      "org:read",
      "org:members:read",
      "ai:read",
      "ai:chat",
      "ai:image:generate",
      "file:read",
      "file:upload",
      "file:delete",
      "api_key:read",
      "api_key:manage",
      "usage:read",
    ]),
    viewer: new Set<Permission>([
      "org:read",
      "org:members:read",
      "ai:read",
      "file:read",
      "usage:read",
    ]),
  });

/**
 * Platform-role → permission map. Frozen at module load.
 *
 * Design intent:
 *   - `super_admin`  — everything. Platform-wide user/system management.
 *   - `admin`        — platform admin: read + manage users, read system state.
 *                      Cannot delete accounts or export user data (GDPR).
 *   - `team_owner`   — owns a team: full AI access, billing, team management.
 *   - `team_member`  — team member: AI access, file management, read usage.
 *   - `premium_user` — paid individual: full AI access (incl. image/video/voice),
 *                      billing:read, account management.
 *   - `free_user`    — free tier: basic chat, limited file upload, account read.
 */
const PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformRole, ReadonlySet<Permission>>
> = Object.freeze({
  super_admin: new Set<Permission>([
    "org:read", "org:update", "org:delete", "org:members:read", "org:members:manage",
    "ai:read", "ai:chat", "ai:image:generate", "ai:video:generate", "ai:voice:generate",
    "ai:business:use", "ai:marketing:use",
    "file:read", "file:upload", "file:delete",
    "api_key:read", "api_key:manage",
    "billing:read", "billing:manage", "usage:read",
    "admin:read", "admin:users:manage", "admin:system:manage",
    "account:read", "account:update", "account:delete", "account:export:data",
  ]),
  admin: new Set<Permission>([
    "org:read", "org:members:read",
    "ai:read", "ai:chat", "ai:image:generate",
    "file:read",
    "billing:read", "usage:read",
    "admin:read", "admin:users:manage",
    "account:read", "account:update",
  ]),
  team_owner: new Set<Permission>([
    "org:read", "org:update", "org:members:read", "org:members:manage",
    "ai:read", "ai:chat", "ai:image:generate", "ai:video:generate", "ai:voice:generate",
    "ai:business:use", "ai:marketing:use",
    "file:read", "file:upload", "file:delete",
    "api_key:read", "api_key:manage",
    "billing:read", "billing:manage", "usage:read",
    "account:read", "account:update",
  ]),
  team_member: new Set<Permission>([
    "org:read", "org:members:read",
    "ai:read", "ai:chat", "ai:image:generate",
    "file:read", "file:upload", "file:delete",
    "api_key:read", "api_key:manage",
    "usage:read",
    "account:read", "account:update",
  ]),
  premium_user: new Set<Permission>([
    "ai:read", "ai:chat", "ai:image:generate", "ai:video:generate", "ai:voice:generate",
    "ai:business:use", "ai:marketing:use",
    "file:read", "file:upload", "file:delete",
    "api_key:read", "api_key:manage",
    "billing:read", "usage:read",
    "account:read", "account:update", "account:delete", "account:export:data",
  ]),
  free_user: new Set<Permission>([
    "ai:read", "ai:chat",
    "file:read", "file:upload",
    "api_key:read",
    "usage:read",
    "account:read", "account:update", "account:delete", "account:export:data",
  ]),
});

/**
 * Predicate: does `role` grant `permission`? The most granular check; use it
 * inside helpers that already know the caller's role.
 *
 * @example
 * ```ts
 * if (!can(member.role, "ai:image:generate")) {
 *   throw new AuthorizationError("Your plan does not include image generation.");
 * }
 * ```
 */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) === true;
}

/**
 * Platform-role permission check. Use for account-level capabilities (plan
 * tier, admin access, premium features) as opposed to org-scoped collaboration.
 *
 * @example
 * ```ts
 * if (!canPlatform(user.platform_role, "ai:video:generate")) {
 *   throw new AuthorizationError("Upgrade to Premium to generate videos.");
 * }
 * ```
 */
export function canPlatform(
  role: PlatformRole,
  permission: Permission,
): boolean {
  return PLATFORM_ROLE_PERMISSIONS[role]?.has(permission) === true;
}

/** Type guard: is `value` a valid {@link Role}? */
export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" &&
    (ROLES as readonly string[]).includes(value)
  );
}

/** Type guard: is `value` a valid {@link PlatformRole}? */
export function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    typeof value === "string" &&
    (PLATFORM_ROLES as readonly string[]).includes(value)
  );
}

/** Minimal structural shape `hasPermission` needs from a user. */
export interface PermissionActor {
  id?: string;
  role?: Role | string | null;
  platformRole?: PlatformRole | string | null;
}

/**
 * Policy entry point: does `user` have `action` on `resource`?
 *
 * Checks the platform role first (account-level capabilities); falls back to
 * the org role (workspace collaboration). Returns `false` for unknown roles
 * or a missing `user` — never throws.
 */
export function hasPermission(
  user: PermissionActor | null | undefined,
  action: Permission,
  _resource?: string,
): boolean {
  if (!user) return false;

  // Check platform role first.
  if (user.platformRole && isPlatformRole(user.platformRole)) {
    if (canPlatform(user.platformRole, action)) return true;
  }

  // Fall back to org role.
  if (user.role && isRole(user.role)) {
    return can(user.role, action);
  }

  return false;
}

/**
 * Human-readable label for a platform role. Used in the UI (settings, admin).
 */
export const PLATFORM_ROLE_LABELS: Readonly<Record<PlatformRole, string>> =
  Object.freeze({
    super_admin: "Super Admin",
    admin: "Admin",
    team_owner: "Team Owner",
    team_member: "Team Member",
    premium_user: "Premium User",
    free_user: "Free User",
  });
