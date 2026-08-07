/**
 * Supa AI — authentication & session types.
 *
 * These types describe the *shape* of authenticated identity as seen by
 * server code and client components. They are transport-agnostic — Supabase
 * Auth, magic links, and OAuth providers all normalize into the same
 * {@link AuthUser} / {@link AuthSession} shapes.
 *
 * @module @/types/auth
 */

import type { ID, ISODateString, UUID } from "./common";

/** Supported authentication providers. */
export type AuthProvider =
  | "email"
  | "google"
  | "github"
  | "apple"
  | "magic_link";

/**
 * Role assigned to a user. Drives authorization decisions:
 * - `owner`  — full org control, including billing and deletion.
 * - `admin`  — manage members and most resources, no billing.
 * - `member` — standard access to resources owned by the org.
 */
export type AuthRole = "admin" | "member" | "owner";

/** Canonical authenticated user, normalized from Supabase Auth. */
export interface AuthUser {
  id: UUID;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  role: AuthRole;
  emailVerified: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  lastSignInAt?: ISODateString | null;
}

/** Server-side session record. The token itself never leaves the server. */
export interface AuthSession {
  id: ID;
  userId: UUID;
  /** Opaque session token. Treated as a secret — never log or expose. */
  token: string;
  expiresAt: ISODateString;
  createdAt: ISODateString;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Input for the sign-up flow. */
export interface SignUpInput {
  email: string;
  password: string;
  displayName?: string;
  acceptTerms: boolean;
}

/** Input for the sign-in flow. */
export interface SignInInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}
