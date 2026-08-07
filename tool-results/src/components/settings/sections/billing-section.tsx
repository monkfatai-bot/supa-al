"use client";

/**
 * Supa AI — Settings / Billing section.
 *
 * Surfaces the payment-provider status (Stripe / Paystack / Flutterwave —
 * configured? default? supported regions?) and the full subscription plan
 * catalog (Free → Enterprise with monthly / yearly prices and features).
 *
 * Read-only in Phase 1 — managing subscriptions happens in Phase 2 (chat
 * + checkout). The plan catalog is the canonical `PLANS` from
 * `@/lib/billing/plans`.
 *
 * @module @/components/settings/sections/billing-section
 */
import * as React from "react";
import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FoundationData } from "@/components/dashboard/foundation-data";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface BillingSectionProps {
  data: FoundationData;
}

function formatPrice(cents: number, currency: string): string {
  if (cents < 0) return "Custom";
  if (cents === 0) return "Free";
  const dollars = (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return dollars;
}

export function BillingSection({ data }: BillingSectionProps) {
  const currency = data.defaultCurrency;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">Payment providers</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Status reflects whether a secret key is configured for each provider in <code className="font-mono">.env</code>.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="hidden sm:table-cell">Supported regions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.paymentProviders.map((provider) => (
              <TableRow key={provider.id}>
                <TableCell>
                  <span className="text-sm font-medium">{provider.label}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={provider.configured ? "ok" : "disabled"}
                    label={provider.configured ? "Configured" : "Not configured"}
                  />
                </TableCell>
                <TableCell>
                  {provider.isDefault ? (
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                      Default
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {provider.supportedRegions.map((region) => (
                      <span
                        key={region}
                        className="inline-flex items-center rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {region}
                      </span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <p className="text-sm font-medium">Subscription plans</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The canonical plan catalog from <code className="font-mono">@/lib/billing/plans</code>.
          Limits + features drive both the pricing page and feature gating.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.plans.map((plan) => {
          const isCustom = plan.priceMonthly < 0;
          const isFree = plan.priceMonthly === 0;
          return (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-4",
                plan.tier === "pro" && "border-brand bg-brand-muted/20",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {plan.name}
                    {plan.tier === "pro" ? (
                      <Sparkles className="size-3.5 text-brand" aria-hidden="true" />
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {plan.tier} tier · {plan.currency.toUpperCase()}
                  </p>
                </div>
                {plan.tier === "pro" ? (
                  <Badge className="text-[10px] uppercase tracking-wide">Popular</Badge>
                ) : null}
              </div>

              <div className="flex items-baseline gap-1">
                {isCustom ? (
                  <span className="text-2xl font-semibold tracking-tight">Custom</span>
                ) : isFree ? (
                  <span className="text-2xl font-semibold tracking-tight">Free</span>
                ) : (
                  <>
                    <span className="text-2xl font-semibold tracking-tight">
                      {formatPrice(plan.priceMonthly, currency)}
                    </span>
                    <span className="text-xs text-muted-foreground">/ mo</span>
                  </>
                )}
              </div>
              {!isCustom && !isFree ? (
                <p className="-mt-2 text-xs text-muted-foreground">
                  or {formatPrice(plan.priceYearly, currency)} / yr
                </p>
              ) : null}

              <ul className="mt-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-xs">
                    <Check
                      className="mt-0.5 size-3 shrink-0 text-brand"
                      aria-hidden="true"
                    />
                    <span className="text-foreground/90">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto border-t pt-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {(plan.limits.messagesPerMonth >= Number.MAX_SAFE_INTEGER
                    ? "Unlimited"
                    : plan.limits.messagesPerMonth.toLocaleString("en-US"))}
                </span>
                {" msgs / mo · "}
                <span className="font-medium text-foreground">
                  {plan.limits.imageGenerationsPerMonth >= Number.MAX_SAFE_INTEGER
                    ? "Unlimited"
                    : plan.limits.imageGenerationsPerMonth.toLocaleString("en-US")}
                </span>
                {" images / mo"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
