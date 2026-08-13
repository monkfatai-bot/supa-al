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

  // If a session was returned (signup also signed the user in), return success and allow the client to navigate
  revalidatePath("/", "layout");
  return { success: true, message: "Signed up and logged in." };
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
  // Return a success object so client-side callers can handle navigation
  return { success: true, message: "Logged in" };
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
  // Return success to the client so it can navigate
  return { success: true, message: "Logged out" };
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
  // Return success so the client can navigate after handling the response
  return { success: true, message: "Password updated successfully." };
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
