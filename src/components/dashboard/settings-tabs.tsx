"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Save,
  Loader2,
  Upload,
  Trash2,
  User,
  Shield,
  Bell,
  Link2,
  AlertTriangle,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  updateProfile,
  changePassword,
  changeEmail,
  deleteAccount,
} from "@/services/auth";
import {
  updateProfileSchema,
  changePasswordSchema,
  changeEmailSchema,
  deleteAccountSchema,
  type UpdateProfileFormValues,
  type ChangePasswordFormValues,
  type ChangeEmailFormValues,
} from "@/services/auth/validation";
import { uploadAvatar, removeAvatar } from "@/services/avatar/actions";
import { updateUserSettings, getUserSettings } from "@/services/user-settings";
import { getConnectedAccounts, disconnectAccount } from "@/services/connected-accounts";
import { PasswordInput } from "@/components/auth/password-input";
import { getInitials } from "@/lib/utils";
import type { Profile, UserSettings as UserSettingsType, ConnectedAccount } from "@/types/generated/database";

interface SettingsTabsProps {
  profile: Profile;
  userEmail: string | null;
}

export function SettingsTabs({ profile, userEmail }: SettingsTabsProps) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList>
        <TabsTrigger value="profile">
          <User className="h-4 w-4" />
          Profile
        </TabsTrigger>
        <TabsTrigger value="security">
          <Shield className="h-4 w-4" />
          Security
        </TabsTrigger>
        <TabsTrigger value="notifications">
          <Bell className="h-4 w-4" />
          Notifications
        </TabsTrigger>
        <TabsTrigger value="connected">
          <Link2 className="h-4 w-4" />
          Connected
        </TabsTrigger>
        <TabsTrigger value="danger">
          <AlertTriangle className="h-4 w-4" />
          Danger
        </TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfileTab profile={profile} />
      </TabsContent>
      <TabsContent value="security">
        <SecurityTab userEmail={userEmail} />
      </TabsContent>
      <TabsContent value="notifications">
        <NotificationsTab />
      </TabsContent>
      <TabsContent value="connected">
        <ConnectedAccountsTab />
      </TabsContent>
      <TabsContent value="danger">
        <DangerZoneTab />
      </TabsContent>
    </Tabs>
  );
}

/* ==========================================================================
   Tab 1: Profile
   ========================================================================== */

function ProfileTab({ profile }: { profile: Profile }) {
  const [currentAvatar, setCurrentAvatar] = useState(profile.avatar_url);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdateProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: profile.full_name ?? "",
      username: profile.username ?? "",
      bio: profile.bio ?? "",
      company: profile.company ?? "",
      jobTitle: profile.job_title ?? "",
      website: profile.website ?? "",
      phone: profile.phone ?? "",
      country: profile.country ?? "",
      timezone: profile.timezone,
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const watched = watch();
  const initials = getInitials(watched.fullName || profile.full_name);
  const displayName = watched.fullName || profile.full_name;

  async function onSubmit(values: UpdateProfileFormValues) {
    setIsSaving(true);
    const result = await updateProfile({
      fullName: values.fullName?.trim() || null,
      username: values.username?.trim() || null,
      bio: values.bio?.trim() || null,
      company: values.company?.trim() || null,
      jobTitle: values.jobTitle?.trim() || null,
      website: values.website?.trim() || null,
      phone: values.phone?.trim() || null,
      country: values.country?.trim() || null,
      timezone: values.timezone,
    });

    if (result.success) {
      toast.success("Profile updated");
    } else {
      toast.error(result.message);
    }
    setIsSaving(false);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    const result = await uploadAvatar(formData);
    if (result.success && result.avatarUrl) {
      setCurrentAvatar(result.avatarUrl);
      toast.success("Avatar updated");
    } else {
      toast.error(result.message);
    }
    setIsUploading(false);
  }

  async function handleRemoveAvatar() {
    const result = await removeAvatar();
    if (result.success) {
      setCurrentAvatar(null);
      toast.success("Avatar removed");
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Update your personal information and avatar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={currentAvatar ?? undefined} alt={displayName ?? ""} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Label htmlFor="avatar-upload" className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild disabled={isUploading}>
                    {isUploading ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-3 w-3" />
                    )}
                    Upload
                  </Button>
                </Label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={isUploading}
                />
                {currentAvatar && (
                  <Button variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                    <Trash2 className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                PNG, JPEG, WebP, or GIF. Max 2MB.
              </p>
            </div>
          </div>

          <Separator />

          {/* Name & Username */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Your name"
                maxLength={100}
                {...register("fullName")}
              />
              {errors.fullName && (
                <p className="text-xs text-destructive">{errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="johndoe"
                maxLength={30}
                {...register("username")}
              />
              {errors.username && (
                <p className="text-xs text-destructive">{errors.username.message}</p>
              )}
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              placeholder="Tell us about yourself"
              maxLength={500}
              {...register("bio")}
            />
            {errors.bio && (
              <p className="text-xs text-destructive">{errors.bio.message}</p>
            )}
          </div>

          {/* Company & Job Title */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                placeholder="Acme Inc."
                maxLength={100}
                {...register("company")}
              />
              {errors.company && (
                <p className="text-xs text-destructive">{errors.company.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title</Label>
              <Input
                id="jobTitle"
                placeholder="Software Engineer"
                maxLength={100}
                {...register("jobTitle")}
              />
              {errors.jobTitle && (
                <p className="text-xs text-destructive">{errors.jobTitle.message}</p>
              )}
            </div>
          </div>

          {/* Website & Phone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://example.com"
                {...register("website")}
              />
              {errors.website && (
                <p className="text-xs text-destructive">{errors.website.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="+1 (555) 000-0000"
                maxLength={20}
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>
          </div>

          {/* Country & Timezone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="United States"
                maxLength={100}
                {...register("country")}
              />
              {errors.country && (
                <p className="text-xs text-destructive">{errors.country.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="America/New_York"
                maxLength={50}
                {...register("timezone")}
              />
              {errors.timezone && (
                <p className="text-xs text-destructive">{errors.timezone.message}</p>
              )}
            </div>
          </div>

          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   Tab 2: Security
   ========================================================================== */

function SecurityTab({ userEmail }: { userEmail: string | null }) {
  return (
    <div className="space-y-6">
      <ChangePasswordCard />
      <ChangeEmailCard currentEmail={userEmail} />
    </div>
  );
}

function ChangePasswordCard() {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function onSubmit(values: ChangePasswordFormValues) {
    startTransition(async () => {
      const result = await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      if (result.success) {
        toast.success("Password changed successfully");
        reset();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>
          Update your password. You will need to enter your current password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <PasswordInput
              id="current-password"
              placeholder="Enter current password"
              disabled={isPending}
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <PasswordInput
              id="new-password"
              placeholder="Enter new password"
              showStrength
              disabled={isPending}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">Confirm New Password</Label>
            <PasswordInput
              id="confirm-new-password"
              placeholder="Confirm new password"
              disabled={isPending}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangeEmailCard({ currentEmail }: { currentEmail: string | null }) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "", confirmEmail: "", password: "" },
  });

  function onSubmit(values: ChangeEmailFormValues) {
    startTransition(async () => {
      const result = await changeEmail({
        newEmail: values.newEmail,
        password: values.password,
      });
      if (result.success) {
        toast.success(result.message);
        reset();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change Email</CardTitle>
        <CardDescription>
          Update your email address. A verification link will be sent to your new email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Current Email</Label>
            <Input value={currentEmail ?? ""} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-email">New Email</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isPending}
              {...register("newEmail")}
            />
            {errors.newEmail && (
              <p className="text-xs text-destructive">{errors.newEmail.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-email">Confirm New Email</Label>
            <Input
              id="confirm-email"
              type="email"
              placeholder="Confirm your new email"
              autoComplete="email"
              disabled={isPending}
              {...register("confirmEmail")}
            />
            {errors.confirmEmail && (
              <p className="text-xs text-destructive">{errors.confirmEmail.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-password">Current Password</Label>
            <PasswordInput
              id="email-password"
              placeholder="Enter your current password"
              disabled={isPending}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change Email
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   Tab 3: Notification Preferences
   ========================================================================== */

function NotificationsTab() {
  const [settings, setSettings] = useState<UserSettingsType | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const data = await getUserSettings();
      setSettings(data);
    })();
  }, []);

  const handleToggle = useCallback(
    (key: "email_notifications" | "workspace_notifications" | "security_alerts") => {
      if (!settings) return;
      const newValue = !settings[key];
      setSettings((prev) => (prev ? { ...prev, [key]: newValue } : prev));

      startTransition(async () => {
        const result = await updateUserSettings({ [key]: newValue });
        if (!result.success) {
          toast.error(result.message);
          // Revert on failure
          setSettings((prev) => (prev ? { ...prev, [key]: !newValue } : prev));
        } else {
          toast.success("Notification preference updated");
        }
      });
    },
    [settings],
  );

  if (!settings) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose which notifications you want to receive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email-notifications" className="text-sm font-medium">
              Email Notifications
            </Label>
            <p className="text-muted-foreground text-xs">
              Receive email notifications for account activity.
            </p>
          </div>
          <Switch
            id="email-notifications"
            checked={settings.email_notifications}
            onCheckedChange={() => handleToggle("email_notifications")}
            disabled={isPending}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="workspace-notifications" className="text-sm font-medium">
              Workspace Notifications
            </Label>
            <p className="text-muted-foreground text-xs">
              Receive notifications about workspace activity and updates.
            </p>
          </div>
          <Switch
            id="workspace-notifications"
            checked={settings.workspace_notifications}
            onCheckedChange={() => handleToggle("workspace_notifications")}
            disabled={isPending}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="security-alerts" className="text-sm font-medium">
              Security Alerts
            </Label>
            <p className="text-muted-foreground text-xs">
              Get notified about security events like suspicious logins.
            </p>
          </div>
          <Switch
            id="security-alerts"
            checked={settings.security_alerts}
            onCheckedChange={() => handleToggle("security_alerts")}
            disabled={isPending}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   Tab 4: Connected Accounts
   ========================================================================== */

function ConnectedAccountsTab() {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const data = await getConnectedAccounts();
      setAccounts(data);
      setIsLoading(false);
    })();
  }, []);

  function handleDisconnect(accountId: string) {
    startTransition(async () => {
      const result = await disconnectAccount(accountId);
      if (result.success) {
        toast.success("Account disconnected");
        setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      } else {
        toast.error(result.message);
      }
    });
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Manage third-party accounts linked to your profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No connected accounts found.
          </p>
        ) : (
          <div className="space-y-4">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium capitalize">
                    {account.provider.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium capitalize">{account.provider.replace(/_/g, " ")}</p>
                    {account.display_name && (
                      <p className="text-muted-foreground text-xs">{account.display_name}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect(account.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Unlink className="mr-1 h-3 w-3" />
                  )}
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ==========================================================================
   Tab 5: Danger Zone
   ========================================================================== */

function DangerZoneTab() {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { confirmation: "" },
  });

  function onSubmit(_values: { confirmation: string }) {
    startTransition(async () => {
      const result = await deleteAccount();
      // If successful, the action redirects to login.
      // If it fails, show the error.
      if (!result.success) {
        toast.error(result.message);
        reset();
      }
    });
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          Irreversible and destructive actions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium">Delete Account</h3>
            <p className="text-muted-foreground text-xs mt-1">
              Permanently delete your account and all associated data. This action
              cannot be undone.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <span className="font-mono font-bold">DELETE</span> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                placeholder="DELETE"
                disabled={isPending}
                className="max-w-xs"
                {...register("confirmation")}
              />
              {errors.confirmation && (
                <p className="text-xs text-destructive">{errors.confirmation.message}</p>
              )}
            </div>

            <Button
              type="submit"
              variant="destructive"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete My Account
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
