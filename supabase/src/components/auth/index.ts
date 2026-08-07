"use client";

/**
 * Supa AI — auth components barrel (Phase 2 UI).
 *
 * Single import surface for the auth UI. The orchestrator's `/` route
 * imports `<AuthFlow>` from here; sub-components are re-exported for
 * granular use (e.g. storybook, isolated testing).
 *
 * @module @/components/auth
 */
export { AuthFlow, type AuthFlowProps } from "./auth-flow";
export { AuthLayout, type AuthLayoutProps } from "./auth-layout";
export { AuthFormCard, type AuthFormCardProps } from "./auth-form-card";
export {
  AuthErrorAlert,
  type AuthErrorAlertProps,
  AUTH_ERROR_SLUGS,
  slugToAuthError,
} from "./auth-error-alert";
export { OAuthButtons, type OAuthButtonsProps } from "./oauth-buttons";
export { OAuthCallback, type OAuthCallbackProps } from "./oauth-callback";
export {
  SupabaseConfigNotice,
  type SupabaseConfigNoticeProps,
} from "./supabase-config-notice";
export { PasswordInput, type PasswordInputProps } from "./password-input";
export { LoginForm, type LoginFormProps } from "./login-form";
export { RegisterForm, type RegisterFormProps } from "./register-form";
export {
  ForgotPasswordForm,
  type ForgotPasswordFormProps,
} from "./forgot-password-form";
export {
  ResetPasswordForm,
  type ResetPasswordFormProps,
} from "./reset-password-form";
export { VerifyEmailForm, type VerifyEmailFormProps } from "./verify-email-form";
export {
  type AuthScreen,
  type AuthScreenContext,
  type OnScreenChange,
  type AuthScreenProps,
} from "./types";
