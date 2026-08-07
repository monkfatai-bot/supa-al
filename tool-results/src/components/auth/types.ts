"use client";

/**
 * Supa AI — auth screen types.
 *
 * Shared types used by every auth screen so they can request screen
 * transitions from the parent `<AuthFlow>` (e.g. the login form's
 * "Don't have an account? Sign up" link asks the flow to switch to the
 * `register` screen).
 *
 * @module @/components/auth/types
 */

/** Every screen the auth flow can render. */
export type AuthScreen =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "verify-email"
  | "oauth-callback";

/**
 * Optional context that can accompany a screen transition — e.g. the
 * register form forwards the new user's email when switching to the
 * `verify-email` screen so that screen can render "Check your email at
 * {email}".
 */
export interface AuthScreenContext {
  /** Email of the user who just signed up (forwarded to verify-email). */
  email?: string;
  /** Display name (forwarded to verify-email for personalization). */
  displayName?: string;
}

/**
 * Callback every auth screen receives to request a screen transition. The
 * parent `<AuthFlow>` is the single owner of the `screen` state; screens
 * just ask it to switch. The optional `context` lets the calling screen
 * forward state (the new user's email, etc.) to the next screen.
 */
export type OnScreenChange = (screen: AuthScreen, context?: AuthScreenContext) => void;

/** Props shared by every auth screen. */
export interface AuthScreenProps {
  onScreenChange: OnScreenChange;
  /**
   * Initial context forwarded by the parent flow (e.g. the email captured
   * at signup, used by the verify-email screen).
   */
  initialContext?: AuthScreenContext;
}
