"use client";

/**
 * Supa AI — Credits progress.
 *
 * Renders the user's AI-credits balance alongside a progress bar showing
 * how much of the plan's monthly message allowance remains.
 *
 * Behavior:
 *   - `free` plan          → "Pay-as-you-go" (no bar). Free users can buy
 *                            additional credits on demand, so the monthly
 *                            allowance isn't a hard ceiling.
 *   - `enterprise` plan    → "Unlimited" (no bar). The plan's
 *                            `messagesPerMonth` is `Number.MAX_SAFE_INTEGER`,
 *                            which would render a meaningless 0% bar.
 *   - All other paid plans → progress bar with `balance / limit` as the
 *                            filled percentage. The numeric balance is
 *                            rendered with `formatNumber` for compact K/M
 *                            notation on large numbers.
 *
 * The bar uses the brand emerald accent (`bg-brand`) so the indicator
 * visually ties back to the Supa AI mark.
 *
 * @module @/components/dashboard/credits-progress
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/utils/index";
import { findPlan } from "@/lib/billing/plans";
import { Progress } from "@/components/ui/progress";

export interface CreditsProgressProps {
  /** Current credits balance (from `profile.credits_balance`). */
  balance: number;
  /** Plan id (e.g. `"free"`, `"starter"`, `"pro"`, `"business"`, `"enterprise"`). */
  plan: string;
  /** Extra class names on the outer wrapper. */
  className?: string;
}

/**
 * Render the credits balance + (optionally) a progress bar showing the
 * remaining fraction of the plan's monthly message allowance.
 *
 * Purely presentational — derived entirely from the props + the static
 * `PLANS` catalog. No fetches, no client state.
 */
export function CreditsProgress({
  balance,
  plan,
  className,
}: CreditsProgressProps) {
  const planMeta = findPlan(plan);
  // Unknown plan id — render a minimal, honest fallback.
  if (!planMeta) {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(balance)}
        </p>
        <p className="text-xs text-muted-foreground">
          Plan unknown — credit usage tracking unavailable.
        </p>
      </div>
    );
  }

  // Free plan: pay-as-you-go. No monthly cap to render.
  if (planMeta.tier === "free") {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(balance)}
        </p>
        <p className="text-xs text-muted-foreground">Pay-as-you-go credits</p>
      </div>
    );
  }

  // Enterprise: unlimited. The plan's messagesPerMonth is MAX_SAFE_INTEGER,
  // so a percentage would be meaningless.
  if (planMeta.tier === "enterprise") {
    return (
      <div className={cn("space-y-1", className)}>
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(balance)}
        </p>
        <p className="text-xs text-muted-foreground">Unlimited (fair-use)</p>
      </div>
    );
  }

  // Paid plan with a finite monthly limit — render the bar.
  const limit = planMeta.limits.messagesPerMonth;
  const safeLimit = limit > 0 ? limit : 1;
  const pct = Math.max(0, Math.min(100, (balance / safeLimit) * 100));
  const remainingLabel =
    balance <= 0
      ? "No credits remaining this cycle"
      : `${formatNumber(balance)} of ${formatNumber(limit)} remaining`;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(balance)}
        </p>
        <span className="text-xs text-muted-foreground tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>
      <Progress
        value={pct}
        aria-label={`${Math.round(pct)} percent of monthly credits remaining`}
        className="bg-muted h-2"
      />
      <p className="text-xs text-muted-foreground">{remainingLabel}</p>
    </div>
  );
}
