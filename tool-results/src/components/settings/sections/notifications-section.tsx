"use client";

/**
 * Supa AI — Settings / Notifications section.
 *
 * Phase 1 ships with NO notification channels wired up (email / webhook /
 * Slack all arrive in a later phase). We surface this honestly: a centered
 * empty state explaining what's coming, plus disabled toggles for each
 * planned channel so the UI shape is already familiar.
 *
 * @module @/components/settings/sections/notifications-section
 */
import * as React from "react";
import { BellOff, Mail, MessageSquare, Webhook } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ComingSoon } from "@/components/shared/coming-soon";
import { EmptyState } from "@/components/shared/empty-state";

const PLANNED_CHANNELS: Array<{
  id: string;
  label: string;
  description: string;
  icon: typeof Mail;
}> = [
  {
    id: "email",
    label: "Email",
    description: "Transactional emails via Supabase Auth + a transactional provider.",
    icon: Mail,
  },
  {
    id: "in-app",
    label: "In-app",
    description: "Bell-icon notifications persisted to the database.",
    icon: MessageSquare,
  },
  {
    id: "webhook",
    label: "Webhook",
    description: "Outbound HTTP webhooks for system events.",
    icon: Webhook,
  },
];

export function NotificationsSection() {
  return (
    <div className="space-y-6">
      <EmptyState
        icon={BellOff}
        title="No notification channels configured"
        description="Email, in-app, and webhook channels arrive in a later phase. Until then, system events surface only in the dashboard activity log."
      />

      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          Planned channels
          <ComingSoon />
        </p>
        <div className="divide-y rounded-lg border">
          {PLANNED_CHANNELS.map((channel) => (
            <div
              key={channel.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <channel.icon className="size-4" aria-hidden="true" />
                </span>
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{channel.label}</Label>
                  <p className="text-xs text-muted-foreground">
                    {channel.description}
                  </p>
                </div>
              </div>
              <Switch disabled aria-label={`${channel.label} (coming soon)`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
