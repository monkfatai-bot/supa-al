"use client";

/**
 * Supa AI — Settings / Account section.
 *
 * Aggregates the user's account-management surfaces into a single tab:
 *
 *   1. Change password (re-auth required, all other sessions revoked).
 *   2. Change email (Supabase email-change verification flow).
 *   3. Download personal data (GDPR data export — signed-URL link valid 7 days).
 *   4. Danger zone — permanently delete account (AlertDialog + type DELETE
 *      + password re-auth; irreversibly signs the user out on success).
 *
 * Every sub-form is independently submitted; each has its own loading
 * state, per-field errors, and success toast.
 *
 * @module @/components/settings/sections/account-section
 */
import * as React from "react";
import {
  AlertTriangle,
  Download,
  KeyRound,
  Loader2,
  Mail,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils/index";
import {
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useDownloadData,
  type SettingsApiError,
} from "@/hooks/use-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SubSection } from "@/components/settings/sections/_sub-section";

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

const passwordConfirmSchema = z
  .string()
  .min(1, "Please confirm your new password.");

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setErrors({});
    setSubmitError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    // Local validation: confirm match + new-password policy summary.
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = "Current password is required.";
    if (newPassword.length < 8) nextErrors.newPassword = "Password must be at least 8 characters.";
    else if (!/[A-Z]/.test(newPassword)) nextErrors.newPassword = "Add an uppercase letter.";
    else if (!/[a-z]/.test(newPassword)) nextErrors.newPassword = "Add a lowercase letter.";
    else if (!/[0-9]/.test(newPassword)) nextErrors.newPassword = "Add a number.";
    if (newPassword !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match.";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    try {
      await changePassword.mutateAsync({
        currentPassword,
        newPassword,
      });
      toast.success("Password changed", {
        description: "All other devices have been signed out.",
      });
      reset();
    } catch (err) {
      const apiErr = err as SettingsApiError;
      if (apiErr?.fields) setErrors(apiErr.fields);
      setSubmitError(apiErr?.message ?? "Couldn't change password.");
    }
  }

  return (
    <SubSection
      icon={KeyRound}
      title="Change password"
      description="Re-enter your current password to confirm. For your security, all other devices will be signed out."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword}>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.currentPassword)}
            />
          </Field>
          <div className="hidden sm:block" aria-hidden="true" />
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword} hint="Min 8 chars, 1 upper, 1 lower, 1 digit.">
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.newPassword)}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword" error={errors.confirmPassword}>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
            />
          </Field>
        </div>

        {submitError ? (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={changePassword.isPending}>
            {changePassword.isPending ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </SubSection>
  );
}

// ---------------------------------------------------------------------------
// Change email
// ---------------------------------------------------------------------------

function ChangeEmailCard({ currentEmail }: { currentEmail?: string | null }) {
  const changeEmail = useChangeEmail();
  const [newEmail, setNewEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);

    if (!newEmail.trim()) {
      setFieldError("New email is required.");
      return;
    }
    if (!z.string().email().safeParse(newEmail.trim()).success) {
      setFieldError("Please enter a valid email address.");
      return;
    }
    if (newEmail.trim().toLowerCase() === (currentEmail ?? "").toLowerCase()) {
      setFieldError("This is already your email.");
      return;
    }

    setPending(true);
    try {
      await changeEmail.mutateAsync({ newEmail: newEmail.trim() });
      toast.success("Verification email sent", {
        description: "Check your new inbox to confirm the change.",
      });
      setNewEmail("");
      setPending(true); // keep the success note visible
    } catch (err) {
      const apiErr = err as SettingsApiError;
      if (apiErr?.fields?.newEmail) setFieldError(apiErr.fields.newEmail);
      setError(apiErr?.message ?? "Couldn't initiate email change.");
      setPending(false);
    }
  }

  return (
    <SubSection
      icon={Mail}
      title="Change email"
      description={`A verification link will be sent to your new address. The change takes effect after you confirm. Current: ${currentEmail ?? "—"}`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:max-w-md">
          <Field label="New email" htmlFor="newEmail" error={fieldError}>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(fieldError)}
            />
          </Field>
        </div>

        {pending ? (
          <Alert>
            <AlertDescription>
              A verification link has been sent to your new email. The change takes effect after you confirm.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end">
          <Button type="submit" disabled={changeEmail.isPending}>
            {changeEmail.isPending ? "Sending…" : "Send verification link"}
          </Button>
        </div>
      </form>
    </SubSection>
  );
}

// ---------------------------------------------------------------------------
// Download personal data
// ---------------------------------------------------------------------------

function DownloadDataCard() {
  const downloadData = useDownloadData();
  const [result, setResult] = React.useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function onRequest() {
    setError(null);
    try {
      const r = await downloadData.mutateAsync();
      setResult({ url: r.downloadUrl, expiresAt: r.expiresAt });
      toast.success("Your data export is ready", {
        description: "The download link expires in 7 days.",
      });
    } catch (err) {
      const apiErr = err as SettingsApiError;
      setError(apiErr?.message ?? "Couldn't generate the export.");
    }
  }

  const expiresLabel = result
    ? formatRelativeTime(result.expiresAt)
    : null;

  return (
    <SubSection
      icon={Download}
      title="Download personal data"
      description="Export a JSON archive of your profile, settings, activity, and conversations. The signed download link is valid for 7 days."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm">
          {result ? (
            <>
              <p className="font-medium">Your export is ready.</p>
              <p className="text-xs text-muted-foreground">
                Link expires {expiresLabel}.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click the button to generate a fresh export.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result ? (
            <Button asChild variant="default">
              <a href={result.url} download={`supa-ai-export-${Date.now()}.json`}>
                <Download className="size-4" aria-hidden="true" />
                Download
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant={result ? "outline" : "default"}
            disabled={downloadData.isPending}
            onClick={onRequest}
          >
            {downloadData.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Preparing…
              </>
            ) : result ? (
              "Regenerate"
            ) : (
              "Request export"
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </SubSection>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — delete account
// ---------------------------------------------------------------------------

function DeleteAccountCard() {
  const router = useRouter();
  const deleteAccount = useDeleteAccount();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [open, setOpen] = React.useState(false);

  const canSubmit =
    password.length > 0 && confirm.trim() === "DELETE" && !deleteAccount.isPending;

  function reset() {
    setPassword("");
    setConfirm("");
    setError(null);
    setFieldErrors({});
    setOpen(false);
  }

  async function onConfirmDelete() {
    setError(null);
    setFieldErrors({});
    try {
      await deleteAccount.mutateAsync({
        password,
        confirm: "DELETE",
      });
      toast.success("Account deleted", {
        description: "You'll be signed out shortly.",
      });
      reset();
      // Hard reload so the server component re-evaluates the session.
      router.refresh();
    } catch (err) {
      const apiErr = err as SettingsApiError;
      if (apiErr?.fields) setFieldErrors(apiErr.fields);
      setError(apiErr?.message ?? "Couldn't delete account.");
    }
  }

  return (
    <SubSection
      icon={Trash2}
      title="Delete account"
      description="Permanently delete your account, profile, and personal data. This action cannot be undone."
      tone="danger"
    >
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) reset(); else setOpen(true); }}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2 className="size-4" aria-hidden="true" />
            Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" aria-hidden="true" />
              Permanently delete your account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will erase your profile, settings, conversations, and activity
              logs. <strong>This action cannot be undone.</strong> Type{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">DELETE</code>{" "}
              and enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm" className="text-sm font-medium">
                Type DELETE to confirm
              </Label>
              <Input
                id="delete-confirm"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="DELETE"
                aria-invalid={Boolean(fieldErrors.confirm)}
              />
              {fieldErrors.confirm ? (
                <p className="text-xs text-destructive">{fieldErrors.confirm}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              {fieldErrors.password ? (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              ) : null}
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAccount.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onConfirmDelete();
              }}
              disabled={!canSubmit}
              className={cn(
                "bg-destructive text-white hover:bg-destructive/90",
                "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
              )}
            >
              {deleteAccount.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                "Delete my account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>Irreversible operation</AlertTitle>
        <AlertDescription>
          Once your account is deleted, your data cannot be recovered.
          Consider downloading a personal-data export first.
        </AlertDescription>
      </Alert>
    </SubSection>
  );
}

// ---------------------------------------------------------------------------
// Public section
// ---------------------------------------------------------------------------

export interface AccountSectionProps {
  currentEmail?: string | null;
}

export function AccountSection({ currentEmail }: AccountSectionProps) {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <ChangeEmailCard currentEmail={currentEmail} />
      <DownloadDataCard />
      <DeleteAccountCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field wrapper (small)
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
