import { requireAuth, getAuthUser } from "@/services/auth/session";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";

export const metadata = {
  title: "Settings",
  description: "Manage your account settings and preferences.",
};

export default async function SettingsPage() {
  const [profile, authUser] = await Promise.all([requireAuth(), getAuthUser()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>
      <SettingsTabs
        profile={profile}
        userEmail={authUser?.email ?? null}
      />
    </div>
  );
}
