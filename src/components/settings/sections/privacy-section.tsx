"use client";

/**
 * Supa AI — Settings / Privacy section.
 *
 * Three real toggles wired to the `user_settings` table via the
 * `useUpdateSettings` mutation:
 *
 *   - privacy_profile_visible  — who can see your profile.
 *   - privacy_activity_visible — show your activity status to teammates.
 *   - privacy_show_in_search   — allow your profile to appear in search.
 *
 * Same optimistic-update + revert pattern as the notification preferences
 * section.
 *
 * @module @/components/settings/sections/privacy-section
 */
import * as React from "react";
import { Eye, Search, UserCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import type { UserSettings } from "@/lib/auth";
import {
  useUpdateSettings,
  type SettingsApiError,
} from "@/hooks/use-settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type PrivacyField =
  | "privacy_profile_visible"
  | "privacy_activity_visible"
  | "privacy_show_in_search";

interface ToggleConfig {
  field: PrivacyField;
  label: string;
  description: string;
  icon: LucideIcon;
}

const TOGGLES: readonly ToggleConfig[] = [
  {
    field: "privacy_profile_visible",
    label: "Public profile",
    description: "Who can see your profile. When off, only you can view it.",
    icon: Eye,
  },
  {
    field: "privacy_activity_visible",
    label: "Activity status",
    description: "Show your activity status to teammates on shared workspaces.",
    icon: UserCheck,
  },
  {
    field: "privacy_show_in_search",
    label: "Search visibility",
    description: "Allow your profile to appear in search results.",
    icon: Search,
  },
] as const;

export interface PrivacySectionProps {
  settings: UserSettings;
}

export function PrivacySection({ settings }: PrivacySectionProps) {
  const updateSettings = useUpdateSettings();
  const [local, setLocal] = React.useState<UserSettings>(settings);

  React.useEffect(() => {
    setLocal(settings);
  }, [settings]);

  async function onToggle(field: PrivacyField, next: boolean) {
    const prev = local[field];
    setLocal((s) => ({ ...s, [field]: next }));
    try {
      await updateSettings.mutateAsync({ [field]: next });
      toast.success(`${TOGGLES.find((t) => t.field === field)?.label ?? "Setting"} ${next ? "enabled" : "disabled"}`);
    } catch (err) {
      setLocal((s) => ({ ...s, [field]: prev as boolean }));
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't update privacy preference", {
        description: apiErr?.message ?? "Please try again.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Privacy</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Control who can find and view information about you on Supa AI.
        </p>
      </div>

      <ul className="divide-y rounded-lg border">
        {TOGGLES.map((t) => {
          const value = Boolean(local[t.field]);
          const disabled = updateSettings.isPending;
          return (
            <li
              key={t.field}
              className="flex items-center justify-between gap-3 p-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <t.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor={t.field} className="text-sm font-medium">
                    {t.label}
                  </Label>
                  <p className="text-xs text-muted-foreground text-pretty">
                    {t.description}
                  </p>
                </div>
              </div>
              <Switch
                id={t.field}
                checked={value}
                disabled={disabled}
                onCheckedChange={(v) => onToggle(t.field, v)}
                aria-label={t.label}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
