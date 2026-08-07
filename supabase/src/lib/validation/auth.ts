/**
 * Supa AI — auth Zod schemas.
 *
 * Strong, reusable validation rules for every auth flow: sign-up, sign-in,
 * password reset, and password update. The password policy requires
 * 8–128 characters with at least one uppercase, lowercase, and digit.
 *
 * Infer types from these schemas (rather than redeclaring interfaces) so
 * the runtime contract and the TypeScript type can never drift apart.
 *
 * @module @/lib/validation/auth
 */

import { z } from "zod";

/**
 * Strong password policy.
 *
 * - 8–128 characters
 * - ≥ 1 uppercase letter
 * - ≥ 1 lowercase letter
 * - ≥ 1 digit
 *
 * Intentionally permissive on symbols to support password managers. The
 * rules are split into separate `.regex()` calls so each violation yields
 * its own field error message.
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

/** Validated email address (RFC 5322 simplification via Zod). */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address.")
  .max(254, "Email must be at most 254 characters.");

/**
 * Sign-up payload. `acceptTerms` must be the literal `true` so a missing
 * or `false` value yields a clear validation error.
 */
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters.")
    .max(80, "Display name must be at most 80 characters.")
    .optional(),
  acceptTerms: z.literal(
    true,
    "You must accept the Terms of Service to continue.",
  ),
});

/** Sign-in payload. Password policy is *not* enforced here — only presence. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
  rememberMe: z.boolean().optional(),
});

/** Password reset request payload (email only). */
export const passwordResetSchema = z.object({
  email: emailSchema,
});

/**
 * Password update payload. Ensures the new password meets the strong
 * policy and that the confirmation matches via a top-level refine.
 */
export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type Email = z.infer<typeof emailSchema>;
export type Password = z.infer<typeof passwordSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

// ---------------------------------------------------------------------------
// Phase 2 — account management schemas
// ---------------------------------------------------------------------------

/**
 * Change-password payload. The new password must satisfy the strong policy;
 * the current password is required for re-authentication (it is NOT validated
 * here — the auth service uses it to re-authenticate against Supabase).
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

/** Change-email payload. Triggers Supabase's email-change verification flow. */
export const changeEmailSchema = z.object({
  newEmail: emailSchema,
});

/**
 * Username policy: 3–30 chars, letters / digits / underscores only. The regex
 * is anchored so leading/trailing characters are validated.
 */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

/** URL validator reused by the `website` field. */
const websiteSchema = z
  .string()
  .trim()
  .url("Please enter a valid URL (e.g. https://example.com).")
  .max(2_048, "Website URL must be at most 2048 characters.");

/**
 * Update-profile payload. All fields optional; the service merges only the
 * provided ones. `website` is validated as a URL; `username` against the
 * username regex.
 */
export const updateProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(80, "Full name must be at most 80 characters.")
    .optional(),
  username: z
    .string()
    .trim()
    .regex(USERNAME_REGEX, "Username must be 3–30 chars: letters, digits, underscore.")
    .optional(),
  phone_number: z
    .string()
    .trim()
    .min(4, "Phone number is too short.")
    .max(32, "Phone number must be at most 32 characters.")
    .optional(),
  country: z
    .string()
    .trim()
    .min(2, "Country code is too short.")
    .max(2, "Country must be an ISO 3166-1 alpha-2 code (2 chars).")
    .optional(),
  time_zone: z
    .string()
    .trim()
    .min(1, "Time zone is required.")
    .max(64, "Time zone must be at most 64 characters.")
    .optional(),
  locale: z
    .string()
    .trim()
    .min(2, "Locale is too short.")
    .max(16, "Locale must be at most 16 characters.")
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, "Bio must be at most 500 characters.")
    .optional(),
  company: z
    .string()
    .trim()
    .max(100, "Company must be at most 100 characters.")
    .optional(),
  job_title: z
    .string()
    .trim()
    .max(100, "Job title must be at most 100 characters.")
    .optional(),
  website: websiteSchema.optional(),
});

/**
 * Update-settings payload. Every field is optional; consumers merge only the
 * provided ones. Field set mirrors `user_settings` columns.
 */
export const updateSettingsSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]).optional(),
    density: z.enum(["comfortable", "compact"]).optional(),
    notification_email: z.boolean().optional(),
    notification_push: z.boolean().optional(),
    notification_marketing: z.boolean().optional(),
    notification_security: z.boolean().optional(),
    notification_product_updates: z.boolean().optional(),
    privacy_profile_visible: z.boolean().optional(),
    privacy_activity_visible: z.boolean().optional(),
    privacy_show_in_search: z.boolean().optional(),
    two_factor_enabled: z.boolean().optional(),
    session_timeout_minutes: z
      .number()
      .int("Session timeout must be an integer (minutes).")
      .min(5, "Session timeout must be at least 5 minutes.")
      .max(10_080, "Session timeout must be at most 7 days (10080 minutes).")
      .optional(),
  })
  .strict();

/** OAuth provider identifiers supported by Supabase Auth. */
export const oauthProviderSchema = z.enum([
  "google",
  "github",
  "microsoft",
  "apple",
]);

/**
 * Account-deletion payload. The caller MUST type `DELETE` into the confirm
 * field — this is a UX guard against accidental clicks, not a security
 * mechanism (the password is the real verifier).
 */
export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required."),
  confirm: z.literal("DELETE", "Please type DELETE to confirm."),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type OauthProvider = z.infer<typeof oauthProviderSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
