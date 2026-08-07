"use client";

/**
 * Supa AI — Settings / Notification preferences section.
 *
 * Five real toggles wired to the `user_settings` table via the
 * `useUpdateSettings` mutation:
 *
 *   - notification_email
 *   - notification_push
 *   - notification_marketing
 *   - notification_product_updates
 *   - notification_security (locked on — always enabled)
 *
 * Each toggle fires an optimistic PATCH to `/api/settings/update` with the
 * changed field. The local state is reverted on error. Toast feedback is
 * shown on success.
 *
 * @module @/components/settings/sections/notification-preferences-section
 */
import * as React from "react";
import {
  Bell,
  Lock,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import type { UserSettings } from "@/lib/auth";
import {
  useUpdateSettings,
  type SettingsApiError,
} from "@/hooks/use-settings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NotificationField =
  | "notification_email"
  | "notification_push"
  | "notification_marketing"
  | "notification_product_updates"
  | "notification_security";

interface ToggleConfig {
  field: NotificationField;
  label: string;
  description: string;
  icon: LucideIcon;
  /** When `true`, the toggle is permanently on + disabled. */
  locked?: boolean;
}

const TOGGLES: readonly ToggleConfig[] = [
  {
    field: "notification_email",
    label: "Email",
    description: "Receive transactional emails about your account.",
    icon: Bell,
  },
  {
    field: "notification_push",
    label: "Push notifications",
    description: "Real-time push alerts on supported devices.",
    icon: Zap,
  },
  {
    field: "notification_marketing",
    label: "Marketing",
    description: "Product announcements, tips, and special offers.",
    icon: Megaphone,
  },
  {
    field: "notification_product_updates",
    label: "Product updates",
    description: "Changelog, new features, and improvements.",
    icon: Sparkles,
  },
  {
    field: "notification_security",
    label: "Security alerts",
    description: "Sign-in attempts, password changes, and 2FA events.",
    icon: ShieldCheck,
    locked: true,
  },
] as const;

export interface NotificationPreferencesSectionProps {
  settings: UserSettings;
}

export function NotificationPreferencesSection({
  settings,
}: NotificationPreferencesSectionProps) {
  const updateSettings = useUpdateSettings();
  const [local, setLocal] = React.useState<UserSettings>(settings);

  React.useEffect(() => {
    setLocal(settings);
  }, [settings]);

  async function onToggle(field: NotificationField, next: boolean) {
    const prev = local[field];
    // Optimistic update.
    setLocal((s) => ({ ...s, [field]: next }));
    try {
      await updateSettings.mutateAsync({ [field]: next });
      toast.success(`${TOGGLES.find((t) => t.field === field)?.label ?? "Setting"} ${next ? "enabled" : "disabled"}`);
    } catch (err) {
      // Revert on error.
      setLocal((s) => ({ ...s, [field]: prev as boolean }));
      const apiErr = err as SettingsApiError;
      toast.error("Couldn't update preference", {
        description: apiErr?.message ?? "Please try again.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Notification channels</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose how Supa AI contacts you. Security alerts are always enabled.
        </p>
      </div>

      <ul className="divide-y rounded-lg border">
        {TOGGLES.map((t) => {
          const value = Boolean(local[t.field]);
          const disabled = t.locked || updateSettings.isPending;
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
                  <Label
                    htmlFor={t.field}
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    {t.label}
                    {t.locked ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="inline-flex text-muted-foreground">
                            <Lock className="size-3" aria-hidden="true" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Security alerts cannot be disabled</TooltipContent>
                      </Tooltip>
                    ) : null}
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
