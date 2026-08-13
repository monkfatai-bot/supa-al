"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server-client";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireAuth } from "@/services/auth/session";
import { logger } from "@/services/logger";
import { ROUTES } from "@/config/constants";
import { env } from "@/config/env";
import type { AuthActionResponse, SignupInput, LoginInput, ChangePasswordInput, ChangeEmailInput } from "./types";
import { logActivity } from "@/services/activity-log/actions";

/**
 * Determine the app origin reliably in server environments.
 */
function getOrigin() {
  // Prefer explicit NEXT_PUBLIC_APP_URL, otherwise use Vercel-provided URL, otherwise localhost
  return (
    env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Sign up a new user with email/password and create their profile.
 */
export async function signup(
  input: SignupInput
): Promise<AuthActionResponse> {
  // Check if Supabase is configured
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return {
      success: false,
      message:
        "Supabase is not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your environment variables.",
      error: "SUPABASE_NOT_CONFIGURED",
    };
  }

  const supabase = await createServerSupabaseClient();

  const origin = getOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
      },
      // Ensure callback includes explicit next so users return to dashboard after verifying
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    },
  });

  if (error) {
    logger.warn("Signup failed", { reason: error.message, email: input.email });

    if (error.message.includes("already registered")) {
      return { success: false, message: "This email is already registered.", error: "EMAIL_EXISTS" };
    }
    if (error.message.includes("password")) {
      return { success: false, message: "Password does not meet security requirements.", error: "WEAK_PASSWORD" };
    }
    return { success: false, message: "Signup failed. Please try again.", error: "SIGNUP_FAILED" };
  }

  logger.info("User signed up", { userId: data.user?.id, email: input.email });

  // If email confirmation is required, user needs to verify first
  if (data.user && !data.session) {
    return {
      success: true,
      message: "Account created! Please check your email to verify your account.",
    };
  }

  revalidatePath("/", "layout");
  redirect(ROUTES.HOME);
}

/**
 * Log in an existing user with email/password.
 */
export async function login(
  input: LoginInput
): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    logger.warn("Login failed", { reason: error.message, email: input.email });
    void logActivity("login_failed", "Login failed", { reason: error.message, email: input.email });

    if (error.message.includes("Invalid login")) {
      return { success: false, message: "Invalid email or password.", error: "INVALID_CREDENTIALS" };
    }
    if (error.message.includes("Email not confirmed")) {
      return {
        success: false,
        message: "Please verify your email before logging in.",
        error: "EMAIL_NOT_CONFIRMED",
      };
    }
    return { success: false, message: "Login failed. Please try again.", error: "LOGIN_FAILED" };
  }

  logger.info("User logged in", { userId: data.user.id });
  void logActivity("login_success", "User logged in");
  revalidatePath("/", "layout");
  redirect(ROUTES.DASHBOARD);
}

/**
 * Log out the current user and clean up the session.
 */
export async function logout(): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signOut();

  if (error) {
    logger.warn("Logout failed", { reason: error.message });
    return { success: false, message: "Logout failed. Please try again.", error: "LOGOUT_FAILED" };
  }

  logger.info("User logged out");
  revalidatePath("/", "layout");
  redirect(ROUTES.LOGIN);
}

/**
 * Send a password reset email.
 */
export async function resetPassword(
  email: string
): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  const origin = getOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/reset-password`,
  });

  if (error) {
    logger.warn("Password reset request failed", { reason: error.message });
    return { success: false, message: "Unable to send reset email. Please try again.", error: "RESET_FAILED" };
  }

  logger.info("Password reset email sent", { email });
  return {
    success: true,
    message: "If an account with that email exists, a reset link has been sent.",
  };
}

/**
 * Update the user's password (used after reset flow).
 */
export async function updatePassword(
  password: string
): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    logger.warn("Password update failed", { reason: error.message });
    return { success: false, message: "Failed to update password. Please try again.", error: "UPDATE_FAILED" };
  }

  logger.info("Password updated");
  revalidatePath("/", "layout");
  redirect(ROUTES.LOGIN);
}

/**
 * Change the authenticated user's password (requires current password client-side).
 */
export async function changePassword(
  input: ChangePasswordInput
): Promise<AuthActionResponse> {
  await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  if (error) {
    logger.warn("Change password failed", { reason: error.message });
    return { success: false, message: "Failed to change password. Please try again.", error: "CHANGE_PASSWORD_FAILED" };
  }

  void logActivity("password_changed", "Password changed");
  logger.info("Password changed");
  revalidatePath("/dashboard/settings");
  return { success: true, message: "Password changed successfully." };
}

/**
 * Change the authenticated user's email (requires password confirmation client-side).
 * Supabase sends a confirmation email — the profile is updated optimistically.
 */
export async function changeEmail(
  input: ChangeEmailInput
): Promise<AuthActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.updateUser({
    email: input.newEmail,
  });

  if (error) {
    logger.warn("Change email failed", { reason: error.message });
    return { success: false, message: "Failed to change email. Please try again.", error: "CHANGE_EMAIL_FAILED" };
  }

  // Update profile email optimistically so the UI reflects the new value
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ email: input.newEmail })
    .eq("id", profile.id);

  if (profileError) {
    logger.warn("Failed to update profile email", { reason: profileError.message, userId: profile.id });
  }

  void logActivity("email_changed", "Email changed", { newEmail: input.newEmail });
  logger.info("Email change initiated", { userId: profile.id });
  return {
    success: true,
    message: "A verification email has been sent to your new address. Please confirm to complete the change.",
  };
}

/**
 * Delete the authenticated user's account permanently.
 */
export async function deleteAccount(): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, message: "Not authenticated.", error: "UNAUTHORIZED" };
  }

  const userId = user.id;

  // Log activity BEFORE deleting (fire and forget)
  void logActivity("account_deleted", "Account deleted");

  // Use admin client to delete the user — cascades to profiles via on delete cascade
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    logger.error("Failed to delete account", { reason: error.message, userId });
    return { success: false, message: "Failed to delete account. Please try again.", error: "DELETE_FAILED" };
  }

  // Sign out the deleted user's session
  await supabase.auth.signOut();

  logger.info("Account deleted", { userId });
  revalidatePath("/", "layout");
  redirect(ROUTES.LOGIN);
}

/**
 * Update the user's profile with extended fields.
 */
export async function updateProfile(data: {
  fullName?: string | null;
  username?: string | null;
  bio?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  website?: string | null;
  phone?: string | null;
  country?: string | null;
  timezone?: string;
  language?: string;
}): Promise<AuthActionResponse> {
  const profile = await requireAuth();
  const supabase = await createServerSupabaseClient();

  // If username is being set, check uniqueness first
  if (data.username !== undefined && data.username !== null && data.username !== "") {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .neq("id", profile.id)
      .maybeSingle();

    if (existing) {
      return { success: false, message: "This username is already taken.", error: "USERNAME_TAKEN" };
    }
  }

  // Build update object with only defined fields
  const updates: Record<string, unknown> = {};
  if (data.fullName !== undefined) updates.full_name = data.fullName ?? null;
  if (data.username !== undefined) updates.username = data.username === "" ? null : data.username;
  if (data.bio !== undefined) updates.bio = data.bio === "" ? null : data.bio;
  if (data.company !== undefined) updates.company = data.company === "" ? null : data.company;
  if (data.jobTitle !== undefined) updates.job_title = data.jobTitle === "" ? null : data.jobTitle;
  if (data.website !== undefined) updates.website = data.website === "" ? null : data.website;
  if (data.phone !== undefined) updates.phone = data.phone === "" ? null : data.phone;
  if (data.country !== undefined) updates.country = data.country === "" ? null : data.country;
  if (data.timezone !== undefined) updates.timezone = data.timezone;
  if (data.language !== undefined) updates.language = data.language;

  if (Object.keys(updates).length === 0) {
    return { success: true, message: "No changes to save." };
  }

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", profile.id);

  if (error) {
    logger.error("Failed to update profile", { reason: error.message, userId: profile.id });
    return { success: false, message: "Failed to update profile.", error: "UPDATE_FAILED" };
  }

  void logActivity("profile_update", "Updated profile");
  logger.info("Profile updated", { userId: profile.id });
  revalidatePath("/dashboard/settings");
  return { success: true, message: "Profile updated." };
}

/**
 * Initiate social login with an OAuth provider.
 */
export async function loginWithProvider(provider: string): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Get the origin from environment
  const origin = getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as any,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    },
  });

  if (error) {
    logger.warn("Social login failed", { provider, reason: error.message });
    return { success: false, message: `Failed to initiate ${provider} login.`, error: "OAUTH_FAILED" };
  }

  if (!data.url) {
    return { success: false, message: "No redirect URL returned.", error: "OAUTH_FAILED" };
  }

  // Return the URL — the client should redirect to it
  return { success: true, message: data.url };
}

/**
 * Resend the email verification link.
 */
export async function resendVerification(
  email: string
): Promise<AuthActionResponse> {
  const supabase = await createServerSupabaseClient();

  // Get the origin from environment
  const origin = getOrigin();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(ROUTES.DASHBOARD)}`,
    },
  });

  if (error) {
    logger.warn("Resend verification failed", { reason: error.message });
    return { success: false, message: "Unable to resend verification email.", error: "RESEND_FAILED" };
  }

  logger.info("Verification email resent", { email });
  return { success: true, message: "Verification email sent! Please check your inbox." };
}
