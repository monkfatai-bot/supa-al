"use client";

/**
 * Supa AI — Settings panel (Phase 2).
 *
 * Tabbed container rendered inside the dashboard main area when the user
 * switches to the "Settings" section. Phase 2 expands the Phase 1
 * foundation-focused panel (6 tabs) into an 11-tab user-account-focused
 * surface:
 *
 *   1. Profile            — full_name, username, avatar, bio, locale, …
 *   2. Account            — change password, change email, data export, delete
 *   3. Sessions           — multi-device session list + revoke
 *   4. Notifications      — email / push / marketing / product / security toggles
 *   5. Privacy            — profile / activity / search visibility toggles
 *   6. Connected Accounts — OAuth provider list (Google / GitHub / Microsoft / Apple)
 *   7. General            — read-only app identity + environment
 *   8. Appearance         — theme picker + (placeholder) density / accent
 *   9. AI Providers        — table of providers + configured status + masked keys
 *   10. Billing            — payment-provider status + plan catalog
 *   11. Security           — masked secrets + rate-limit presets + upload limits
 *
 * Layout: a vertical sidebar of tabs on `md+`, a horizontally scrollable
 * tab strip on small screens. The signed-out variant renders a friendly
 * "sign in to manage your account settings" empty state for the
 * account-focused tabs; the foundation-focused tabs stay usable.
 *
 * @module @/components/settings/settings-panel
 */
import * as React from "react";
import {
  Bell,
  CreditCard,
  Cpu,
  Globe,
  KeySquare,
  Link2,
  Lock,
  Palette,
  Settings as SettingsIcon,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { FoundationData } from "@/components/dashboard/foundation-data";
import type { DashboardData, Profile, UserSettings } from "@/lib/auth";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { GeneralSection } from "./sections/general-section";
import { AppearanceSection } from "./sections/appearance-section";
import { AiProvidersSection } from "./sections/ai-providers-section";
import { BillingSection } from "./sections/billing-section";
import { SecuritySection } from "./sections/security-section";
import { ProfileSection } from "./sections/profile-section";
import { AccountSection } from "./sections/account-section";
import { SessionsSection } from "./sections/sessions-section";
import { NotificationPreferencesSection } from "./sections/notification-preferences-section";
import { PrivacySection } from "./sections/privacy-section";
import { ConnectedAccountsSection } from "./sections/connected-accounts-section";

export interface SettingsPanelProps {
  /** Phase 1 foundation snapshot — server-derived, always available. */
  data: FoundationData;
  /** Phase 2 user dashboard snapshot — null when signed out. */
  dashboardData?: DashboardData | null;
  /** Authenticated user's email — used for the avatar initials fallback + change-email card. Null when signed out. */
  userEmail?: string | null;
  /** Optional initial tab — used when the user navigated via the user menu. */
  initialTab?: SettingsTab;
}

export type SettingsTab =
  | "profile"
  | "account"
  | "sessions"
  | "notifications"
  | "privacy"
  | "connected-accounts"
  | "general"
  | "appearance"
  | "ai-providers"
  | "billing"
  | "security";

interface TabMeta {
  value: SettingsTab;
  label: string;
  icon: typeof SettingsIcon;
  /** Foundation tabs render even when signed out; account tabs require auth. */
  requiresAuth: boolean;
}

const TABS: readonly TabMeta[] = [
  { value: "profile", label: "Profile", icon: UserIcon, requiresAuth: true },
  { value: "account", label: "Account", icon: KeySquare, requiresAuth: true },
  { value: "sessions", label: "Sessions", icon: Globe, requiresAuth: true },
  { value: "notifications", label: "Notifications", icon: Bell, requiresAuth: true },
  { value: "privacy", label: "Privacy", icon: Lock, requiresAuth: true },
  { value: "connected-accounts", label: "Connected Accounts", icon: Link2, requiresAuth: true },
  { value: "general", label: "General", icon: SettingsIcon, requiresAuth: false },
  { value: "appearance", label: "Appearance", icon: Palette, requiresAuth: false },
  { value: "ai-providers", label: "AI Providers", icon: Cpu, requiresAuth: false },
  { value: "billing", label: "Billing", icon: CreditCard, requiresAuth: false },
  { value: "security", label: "Security", icon: ShieldCheck, requiresAuth: false },
] as const;

export function SettingsPanel({
  data,
  dashboardData,
  userEmail,
  initialTab,
}: SettingsPanelProps) {
  // Pick a sensible default tab — when signed out, fall back to "general".
  const defaultTab: SettingsTab =
    initialTab ?? (dashboardData ? "profile" : "general");

  const profile: Profile | null = dashboardData?.profile ?? null;
  const settings: UserSettings | null = dashboardData?.settings ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, profile, and platform preferences."
        icon={SettingsIcon}
      />

      <Tabs defaultValue={defaultTab} className="gap-4">
        <div className="flex flex-col gap-4 md:flex-row">
          {/* Vertical sidebar on md+, horizontally scrollable strip on mobile */}
          <TabsList
            className={cn(
              "flex h-auto w-full shrink-0 gap-1 overflow-x-auto scrollbar-thin bg-muted/50 p-1",
              "md:w-56 md:flex-col md:overflow-visible",
            )}
          >
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "flex items-center justify-start gap-2 px-3 py-2 text-sm",
                  "flex-1 whitespace-nowrap md:flex-none",
                )}
              >
                <tab.icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0 flex-1">
            {/* Account-focused tabs */}
            <TabsContent value="profile" className="mt-0">
              <SectionShell>
                {profile ? (
                  <ProfileSection
                    profile={profile}
                    email={userEmail}
                  />
                ) : (
                  <SignedOutEmptyState tabLabel="Profile" />
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="account" className="mt-0">
              <SectionShell>
                {profile ? (
                  <AccountSection currentEmail={userEmail} />
                ) : (
                  <SignedOutEmptyState tabLabel="Account" />
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="sessions" className="mt-0">
              <SectionShell>
                {dashboardData ? (
                  <SessionsSection />
                ) : (
                  <SignedOutEmptyState tabLabel="Sessions" />
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="notifications" className="mt-0">
              <SectionShell>
                {settings ? (
                  <NotificationPreferencesSection settings={settings} />
                ) : (
                  <SignedOutEmptyState tabLabel="Notifications" />
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="privacy" className="mt-0">
              <SectionShell>
                {settings ? (
                  <PrivacySection settings={settings} />
                ) : (
                  <SignedOutEmptyState tabLabel="Privacy" />
                )}
              </SectionShell>
            </TabsContent>

            <TabsContent value="connected-accounts" className="mt-0">
              <SectionShell>
                {dashboardData ? (
                  <ConnectedAccountsSection />
                ) : (
                  <SignedOutEmptyState tabLabel="Connected Accounts" />
                )}
              </SectionShell>
            </TabsContent>

            {/* Foundation tabs (always available) */}
            <TabsContent value="general" className="mt-0">
              <SectionShell>
                <GeneralSection data={data} />
              </SectionShell>
            </TabsContent>

            <TabsContent value="appearance" className="mt-0">
              <SectionShell>
                <AppearanceSection />
              </SectionShell>
            </TabsContent>

            <TabsContent value="ai-providers" className="mt-0">
              <SectionShell>
                <AiProvidersSection data={data} />
              </SectionShell>
            </TabsContent>

            <TabsContent value="billing" className="mt-0">
              <SectionShell>
                <BillingSection data={data} />
              </SectionShell>
            </TabsContent>

            <TabsContent value="security" className="mt-0">
              <SectionShell>
                <SecuritySection data={data} />
              </SectionShell>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      {children}
    </div>
  );
}

function SignedOutEmptyState({ tabLabel }: { tabLabel: string }) {
  return (
    <EmptyState
      icon={Lock}
      title={`Sign in to manage your ${tabLabel.toLowerCase()}`}
      description="This section is available once you're signed in. The foundation tabs (General, Appearance, AI Providers, Billing, Security) remain available without an account."
    />
  );
}
