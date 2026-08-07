"use client";

/**
 * Supa AI — Plan badge.
 *
 * Renders a subscription-plan tier badge with a per-tier color treatment.
 * The color is the primary signal (so the eye can distinguish tiers at a
 * glance); the label is the secondary signal. All colors come from the
 * Tailwind palette — never raw hex — so dark mode + theming stay consistent.
 *
 * Tier colors (NO blue / indigo — emerald is the brand accent):
 *
 *   - `free`       → muted / secondary (low-key — most users start here)
 *   - `starter`    → emerald (brand-aligned paid tier)
 *   - `pro`        → violet  (premium feel without resorting to blue)
 *   - `business`   → amber   (warm, "premium for teams")
 *   - `enterprise` → gradient (customary for the top tier; emerald → teal)
 *
 * @module @/components/dashboard/plan-badge
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Profile } from "@/lib/auth";

/** The plan tier this badge represents. */
export type PlanBadgePlan = Profile["subscription_plan"];

/** Human-readable label per tier. */
const PLAN_LABEL: Readonly<Record<PlanBadgePlan, string>> = Object.freeze({
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  business: "Business",
  enterprise: "Enterprise",
});

/** Per-tier color treatment (NO blue / indigo). */
const PLAN_CLASS: Readonly<Record<PlanBadgePlan, string>> = Object.freeze({
  free: "border-transparent bg-muted text-muted-foreground",
  starter:
    "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  pro: "border-transparent bg-violet-500/10 text-violet-700 dark:text-violet-300",
  business:
    "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
  // Enterprise gets a subtle emerald→teal gradient (brand-aligned, top-tier feel).
  enterprise:
    "border-transparent bg-gradient-to-r from-emerald-500/15 to-teal-500/15 text-emerald-800 dark:text-emerald-200",
});

export interface PlanBadgeProps {
  /** The plan tier to render. */
  plan: PlanBadgePlan;
  /** Override the label. Defaults to the canonical tier name. */
  label?: string;
  /** Extra class names. */
  className?: string;
}

/**
 * Render a single subscription-plan tier badge. Purely presentational —
 * no client state, no fetches. The `"use client"` directive lets it be
 * composed inside interactive parents (e.g. the user overview hero).
 */
export function PlanBadge({ plan, label, className }: PlanBadgeProps) {
  const text = label ?? PLAN_LABEL[plan];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium uppercase tracking-wide",
        PLAN_CLASS[plan],
        className,
      )}
    >
      {text}
    </Badge>
  );
}

export { PLAN_LABEL };
