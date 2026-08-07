"use client";

/**
 * Supa AI — User dashboard overview (Phase 2).
 *
 * The post-login landing surface shown inside the `/` route when an
 * authenticated user lands on the `'overview'` section. Renders the
 * user's account snapshot as a hero row, a 4-up stat-card row, a
 * two-column activity / notifications row, and three reference cards
 * (Profile, Billing, Workspace, Recent Documents).
 *
 * All data is REAL — sourced from a single {@link DashboardData} prop
 * assembled by the server component via
 * `profileService.getDashboardData(userId)`. No mock numbers, no fake
 * lists. Empty surfaces render an honest `EmptyState` instead of a
 * placeholder row.
 *
 * Framer Motion: the stat-card row uses a staggered fade-in (delays
 * 0, 50, 100, 150 ms) so the metrics land one-by-one rather than all
 * at once.
 *
 * @module @/components/dashboard/user-overview
 */
import * as React from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Bell,
  CalendarDays,
  CreditCard,
  FileText,
  History,
  Layers,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/utils/index";
import type { DashboardData, Profile } from "@/lib/auth";
import { findPlan } from "@/lib/billing/plans";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ComingSoon } from "@/components/shared/coming-soon";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";

import { ActivityItem } from "./activity-item";
import { NotificationItem } from "./notification-item";
import { PlanBadge } from "./plan-badge";
import { CreditsProgress } from "./credits-progress";
import { ProfileSummaryCard } from "./profile-summary-card";

export interface UserOverviewProps {
  /** Aggregated dashboard snapshot from `profileService.getDashboardData()`. */
  data: DashboardData;
  /** The caller's email (from `auth.users.email`, threaded via the page). */
  email: string | null;
  /** Switch the in-page section to the settings/profile surface. */
  onEditProfile: () => void;
  /** Extra class names on the outer wrapper. */
  className?: string;
}

/** Framer Motion container variants — staggers each child by 50ms. */
const STAT_CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 },
  },
} as const;

/** Framer Motion item variants — fade in from 8px below. */
const STAT_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
} as const;

/** Derive display initials from a profile's `full_name` / `username`. */
function initialsFor(profile: Profile): string {
  const name = (profile.full_name ?? "").trim();
  if (name) {
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
  }
  if (profile.username) {
    return profile.username.slice(0, 2).toUpperCase();
  }
  return "U";
}

/** Extract the first name for the welcome message. */
function firstNameFor(profile: Profile): string {
  const name = (profile.full_name ?? "").trim();
  if (!name) {
    return profile.username ? `@${profile.username}` : "there";
  }
  const first = name.split(/[\s._-]+/)[0];
  return first || "there";
}

export function UserOverview({
  data,
  email,
  onEditProfile,
  className,
}: UserOverviewProps) {
  const { profile, recentActivity, recentNotifications, unreadNotificationCount } =
    data;

  return (
    <div className={cn("space-y-6 p-4 sm:p-6 lg:p-8", className)}>
      {/* Welcome hero --------------------------------------------------- */}
      <WelcomeHero
        profile={profile}
        email={email}
        unreadCount={unreadNotificationCount}
      />

      {/* Stat cards ----------------------------------------------------- */}
      <motion.section
        aria-label="Account metrics"
        variants={STAT_CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <motion.div variants={STAT_ITEM_VARIANTS}>
          <StatCard
            label="Current Plan"
            value={<PlanBadge plan={profile.subscription_plan} />}
            icon={Layers}
            hint={planHint(profile.subscription_plan)}
          />
        </motion.div>
        <motion.div variants={STAT_ITEM_VARIANTS}>
          <StatCard
            label="AI Credits"
            value={
              <CreditsProgress
                balance={data.creditsBalance}
                plan={profile.subscription_plan}
              />
            }
            icon={Sparkles}
            hint={creditsHint(profile.subscription_plan)}
          />
        </motion.div>
        <motion.div variants={STAT_ITEM_VARIANTS}>
          <StatCard
            label="Notifications"
            value={
              <span className="tabular-nums">
                {unreadNotificationCount === 0
                  ? "0"
                  : formatNumber(unreadNotificationCount, {
                      notation: "standard",
                    })}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  unread
                </span>
              </span>
            }
            icon={Bell}
            hint={
              unreadNotificationCount === 0
                ? "You're all caught up"
                : `${recentNotifications.length} recent shown below`
            }
          />
        </motion.div>
        <motion.div variants={STAT_ITEM_VARIANTS}>
          <StatCard
            label="Member Since"
            value={
              <span className="text-xl">
                {formatDate(profile.created_at, { dateStyle: "medium" })}
              </span>
            }
            icon={CalendarDays}
            hint={formatRelativeYears(profile.created_at)}
          />
        </motion.div>
      </motion.section>

      {/* Two-column row: activity + notifications ----------------------- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard
          title="Recent Activity"
          description="The last 10 events recorded on your account."
          icon={History}
          action={<ViewAllStub />}
          contentClassName="p-0 sm:p-0"
        >
          {recentActivity.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={History}
                title="No recent activity yet"
                description="Sign-in events, profile changes, and security actions will show up here."
              />
            </div>
          ) : (
            <ul
              className="max-h-96 divide-y divide-border overflow-y-auto scrollbar-thin"
              aria-label="Recent account activity"
            >
              {recentActivity.map((log) => (
                <ActivityItem key={log.id} log={log} className="rounded-none" />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Notifications"
          description="The last 5 in-app notifications."
          icon={Bell}
          action={<ViewAllStub />}
          contentClassName="p-0 sm:p-0"
        >
          {recentNotifications.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={Bell}
                title="No notifications yet"
                description="Product updates, billing receipts, and security alerts will land here."
              />
            </div>
          ) : (
            <ul
              className="max-h-96 divide-y divide-border overflow-y-auto scrollbar-thin"
              aria-label="Recent notifications"
            >
              {recentNotifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  className="rounded-none"
                />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Profile summary ------------------------------------------------ */}
      <ProfileSummaryCard
        profile={profile}
        email={email}
        onEditProfile={onEditProfile}
      />

      {/* Billing + Workspace two-column --------------------------------- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <BillingSummaryCard data={data} />
        <WorkspaceSummaryCard profile={profile} />
      </div>

      {/* Recent documents ----------------------------------------------- */}
      <SectionCard
        title="Recent Documents"
        description="AI-generated content you've created will appear here."
        icon={FileText}
        action={<ComingSoon />}
      >
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Your AI-generated content (chat exports, generated images, documents) will appear here once the AI Chat surface ships in Phase 3."
        />
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Welcome hero
// ---------------------------------------------------------------------------

interface WelcomeHeroProps {
  profile: Profile;
  email: string | null;
  unreadCount: number;
}

function WelcomeHero({ profile, email, unreadCount }: WelcomeHeroProps) {
  const firstName = firstNameFor(profile);
  const needsVerification = !profile.email_verified;
  const [sending, setSending] = React.useState(false);

  async function onResendVerification() {
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Resend failed (${res.status}).`);
      }
      toast.success("Verification email sent", {
        description: email
          ? `Check ${email} for the verification link.`
          : "Check your inbox for the verification link.",
      });
    } catch {
      toast.error("Couldn't resend verification email", {
        description: "Please try again in a moment.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border bg-card",
        "bg-grid bg-grid-fade",
      )}
    >
      <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-8">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar className="size-14 shrink-0 rounded-full sm:size-16">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="text-lg font-medium sm:text-xl">
              {initialsFor(profile)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Welcome back, {firstName}!
              </h1>
              <PlanBadge plan={profile.subscription_plan} />
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              {greetingSubtitle(profile, unreadCount)}
            </p>
          </div>
        </div>
      </div>

      {needsVerification ? (
        <div
          className={cn(
            "flex flex-col items-start gap-3 border-t border-amber-500/30 bg-amber-500/5 px-6 py-3",
            "sm:flex-row sm:items-center sm:justify-between sm:px-8",
          )}
          role="alert"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Verify your email address
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {email
                  ? `We sent a verification link to ${email}. Resend it if you didn't receive it.`
                  : "Resend the verification link to your inbox."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onResendVerification}
            disabled={sending}
            className={cn(
              "gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15",
              "dark:text-amber-200",
              "shrink-0",
            )}
            aria-label="Resend verification email"
          >
            <Send className="size-3.5" aria-hidden="true" />
            {sending ? "Sending…" : "Resend verification"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Subtitle text under the "Welcome back" heading. */
function greetingSubtitle(profile: Profile, unreadCount: number): string {
  if (unreadCount > 0) {
    return `You have ${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}. Here's your account at a glance.`;
  }
  if (profile.company) {
    return `Here's your account at a glance — managing ${profile.company}.`;
  }
  return "Here's your account at a glance.";
}

// ---------------------------------------------------------------------------
// Billing summary
// ---------------------------------------------------------------------------

interface BillingSummaryCardProps {
  data: DashboardData;
}

function BillingSummaryCard({ data }: BillingSummaryCardProps) {
  const { profile, creditsBalance } = data;
  const planMeta = findPlan(profile.subscription_plan);

  return (
    <SectionCard
      title="Billing Summary"
      description="Your plan, credits balance, and included features."
      icon={CreditCard}
      action={
        <Button variant="outline" size="sm" disabled className="gap-1.5">
          <CreditCard className="size-3.5" aria-hidden="true" />
          Manage billing
          <ComingSoon className="ml-1" />
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Plan + balance -------------------------------------------- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Current Plan
            </p>
            <div className="flex items-center gap-2">
              <PlanBadge plan={profile.subscription_plan} />
              {planMeta ? (
                <span className="text-sm text-muted-foreground">
                  {planMeta.name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Credits Balance
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatNumber(creditsBalance)}
            </p>
          </div>
        </div>

        <Separator />

        {/* Feature checklist ----------------------------------------- */}
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Included Features
          </p>
          {planMeta && planMeta.features.length > 0 ? (
            <ul className="space-y-1.5">
              {planMeta.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2 text-sm text-foreground/90"
                >
                  <CheckDot />
                  <span className="text-pretty">{feature}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No features listed for this plan.
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/** Small emerald check icon for the feature checklist. */
function CheckDot() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    >
      <svg
        viewBox="0 0 16 16"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.5L6.5 12L13 4.5" />
      </svg>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Workspace summary
// ---------------------------------------------------------------------------

interface WorkspaceSummaryCardProps {
  profile: Profile;
}

function WorkspaceSummaryCard({ profile }: WorkspaceSummaryCardProps) {
  return (
    <SectionCard
      title="Workspace"
      description="Where you collaborate. Team workspaces come in Phase 3."
      icon={Users}
      action={<ComingSoon label="Team Phase 3" />}
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
            aria-hidden="true"
          >
            <Users className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Personal workspace</p>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                Owner
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              You're the sole member of your personal workspace. Upgrade to a
              team plan to invite collaborators and share resources.
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Plan Tier
            </p>
            <PlanBadge plan={profile.subscription_plan} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Members
            </p>
            <p className="text-sm font-medium tabular-nums">1 (just you)</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Small "View all" link rendered as a disabled stub (Phase 2 — not wired). */
function ViewAllStub() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      View all
      <ComingSoon />
    </span>
  );
}

/** Hint copy for the "Current Plan" stat card. */
function planHint(plan: Profile["subscription_plan"]): string {
  switch (plan) {
    case "free":
      return "Pay-as-you-go credits";
    case "enterprise":
      return "Contact sales";
    default:
      return "Monthly subscription";
  }
}

/** Hint copy for the "AI Credits" stat card. */
function creditsHint(plan: Profile["subscription_plan"]): string {
  if (plan === "free") return "Pay-as-you-go";
  if (plan === "enterprise") return "Unlimited (fair-use)";
  return "Resets monthly";
}

/** Render "X years" / "X months" / "X days" since a date. */
function formatRelativeYears(date: string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "Today";
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
