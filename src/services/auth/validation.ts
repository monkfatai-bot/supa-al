import { z } from "zod";

/**
 * Password strength rules:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or fewer")
      .trim(),
    email: z.string().email("Please enter a valid email address").toLowerCase().trim(),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address").toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address").toLowerCase().trim(),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Change password (for authenticated users — requires current password)
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"],
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// Change email (requires password confirmation)
export const changeEmailSchema = z
  .object({
    newEmail: z.string().email("Please enter a valid email address").toLowerCase().trim(),
    confirmEmail: z.string().email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required for security"),
  })
  .refine((data) => data.newEmail === data.confirmEmail, {
    message: "Email addresses do not match",
    path: ["confirmEmail"],
  });

export type ChangeEmailFormValues = z.infer<typeof changeEmailSchema>;

// Delete account (requires typing "DELETE" to confirm)
export const deleteAccountSchema = z.object({
  confirmation: z.string().refine((val) => val === "DELETE", {
    message: 'Type "DELETE" to confirm account deletion',
  }),
});

export type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

// Update profile (extended fields)
export const updateProfileSchema = z.object({
  fullName: z.string().max(100, "Name must be 100 characters or fewer").trim().optional(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or fewer")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores")
    .trim()
    .optional()
    .or(z.literal("")),
  bio: z.string().max(500, "Bio must be 500 characters or fewer").trim().optional().or(z.literal("")),
  company: z.string().max(100).trim().optional().or(z.literal("")),
  jobTitle: z.string().max(100).trim().optional().or(z.literal("")),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
  phone: z.string().max(20).trim().optional().or(z.literal("")),
  country: z.string().max(100).trim().optional().or(z.literal("")),
  timezone: z.string().max(50).trim().optional(),
  language: z.string().max(5).trim().optional(),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;
