import * as React from "react";
import {
  AlertTriangle,
  Boxes,
  Cpu,
  CreditCard,
  Database,
  Flag,
  FileLock2,
  Gauge,
  Layers,
  Plug,
  ScrollText,
  Server,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants/app";
import type { FoundationData } from "@/components/dashboard/foundation-data";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { CopyButton } from "@/components/shared/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface DashboardOverviewProps {
  data: FoundationData;
}

function formatPrice(cents: number): string {
  if (cents < 0) return "Custom";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

const MODULE_ICON = {
  config: Plug,
  errors: AlertTriangle,
  logger: Terminal,
  supabase: Database,
  ai: Cpu,
  billing: CreditCard,
  rateLimit: Gauge,
  featureFlags: Flag,
  security: FileLock2,
  storage: Boxes,
  redis: Server,
} as const;

type ModuleId = keyof typeof MODULE_ICON;

/**
 * Supa AI — Dashboard overview.
 *
 * The flagship Phase 1 surface: a hero row, a 4-up stat-card row, a
 * "Foundation Modules" status grid, and three reference tables (AI
 * providers, feature flags, billing plans) — all rendered from a single
 * real `FoundationData` snapshot assembled by the server component.
 *
 * This is a presentational (server-friendly) component — it carries no
 * client state. All interactivity (navigation, copy buttons) is delegated
 * to the small client islands it embeds.
 *
 * @module @/components/dashboard/dashboard-overview
 */
export function DashboardOverview({ data }: DashboardOverviewProps) {
  const aiConfigured = data.aiProviders.filter((p) => p.configured).length;
  const paymentsConfigured = data.paymentProviders.filter((p) => p.configured).length;
  const flagsEnabled = data.featureFlags.filter((f) => f.enabled).length;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Hero ---------------------------------------------------------- */}
      <section
        className={cn(
          "relative overflow-hidden rounded-xl border bg-card",
          "bg-grid bg-grid-fade",
        )}
      >
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-8">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {APP_NAME}
              </h1>
              <StatusBadge
                status={data.environment === "production" ? "ok" : "warning"}
                label={data.environment}
              />
              <Badge variant="outline" className="gap-1 border-brand text-brand">
                <Sparkles className="size-3" aria-hidden="true" />
                Phase 1 · Foundation Ready
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
              The enterprise AI platform foundation is live — config validation,
              structured logging, Supabase auth + RLS, a 7-provider AI facade,
              billing abstractions, rate limiting, feature flags, and a security/crypto
              layer are all wired up and reporting status below.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 rounded-lg border bg-background/60 p-3 text-xs sm:items-end">
            <span className="text-muted-foreground">Build</span>
            <span className="font-mono">v{data.version}</span>
            <span className="mt-1 text-muted-foreground">Default provider</span>
            <span className="font-mono">
              {data.defaultAiProvider} · {data.defaultAiModel}
            </span>
          </div>
        </div>
      </section>

      {/* Stat cards --------------------------------------------------- */}
      <section
        aria-label="Foundation metrics"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="AI providers configured"
          value={`${aiConfigured} / ${data.aiProviders.length}`}
          icon={Cpu}
          hint={`${data.defaultAiProvider} is the default`}
        />
        <StatCard
          label="Payment providers configured"
          value={`${paymentsConfigured} / ${data.paymentProviders.length}`}
          icon={CreditCard}
          hint={`${data.defaultPaymentProvider} · ${data.defaultCurrency.toUpperCase()}`}
        />
        <StatCard
          label="Feature flags enabled"
          value={`${flagsEnabled} / ${data.featureFlags.length}`}
          icon={Flag}
          hint="From env defaults + KV overrides"
        />
        <StatCard
          label="Plan tiers available"
          value={data.plans.length}
          icon={Layers}
          hint="Free → Enterprise"
        />
      </section>

      {/* Foundation modules ------------------------------------------- */}
      <SectionCard
        title="Foundation modules"
        description="Cross-cutting library modules shipped in Phase 1. Every module is built, typed, and lint-clean."
        icon={Layers}
        contentClassName="p-0 sm:p-0"
      >
        <div className="grid grid-cols-1 gap-px overflow-hidden border-t bg-border sm:grid-cols-2 lg:grid-cols-3">
          {data.modules.map((mod) => {
            const Icon = MODULE_ICON[mod.id as ModuleId] ?? Layers;
            return (
              <div
                key={mod.id}
                className="flex items-start gap-3 bg-card p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{mod.name}</p>
                    <StatusBadge status={mod.status} />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {mod.description}
                  </p>
                  <code className="block truncate font-mono text-[10px] text-muted-foreground/80">
                    {mod.path}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* AI providers table ------------------------------------------- */}
      <SectionCard
        title="AI providers"
        description="The 7-provider catalog with real configured status derived from your env."
        icon={Cpu}
        action={
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{aiConfigured}</span>
            {" / "}
            {data.aiProviders.length} configured
          </span>
        }
        contentClassName="p-0 sm:p-0"
      >
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Base URL</TableHead>
                <TableHead>API key</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.aiProviders.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.label}</span>
                      {provider.isDefault ? (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Default
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={provider.configured ? "ok" : "disabled"}
                      label={provider.configured ? "Configured" : "Not configured"}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {provider.baseUrl ? (
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs break-all">{provider.baseUrl}</code>
                        <CopyButton value={provider.baseUrl} toastName="Base URL" />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="font-mono text-xs">{provider.keyPreview}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Two-column row: feature flags + rate limits ------------------ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SectionCard
          title="Feature flags"
          description="Live evaluation of every flag — overrides (when set) take precedence over env defaults."
          icon={Flag}
          contentClassName="p-0 sm:p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flag</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="hidden sm:table-cell">Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.featureFlags.map((flag) => (
                <TableRow key={flag.name}>
                  <TableCell>
                    <code className="font-mono text-xs">{flag.name}</code>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={flag.enabled ? "ok" : "disabled"}
                      label={flag.enabled ? "Enabled" : "Disabled"}
                    />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {flag.source}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>

        <SectionCard
          title="Billing plans"
          description="The canonical plan catalog from @/lib/billing/plans."
          icon={CreditCard}
          contentClassName="p-0 sm:p-0"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead className="hidden sm:table-cell">Yearly</TableHead>
                <TableHead className="hidden md:table-cell">Seats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.plans.map((plan) => {
                const seats = plan.limits.seats;
                const seatsLabel =
                  seats >= Number.MAX_SAFE_INTEGER ? "Unlimited" : String(seats);
                return (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{plan.name}</span>
                        {plan.tier === "pro" ? (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Popular
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {formatPrice(plan.priceMonthly)}
                    </TableCell>
                    <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                      {formatPrice(plan.priceYearly)}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {seatsLabel}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SectionCard>
      </div>

      {/* What's next -------------------------------------------------- */}
      <SectionCard
        title="What's next"
        description="Phase 2 brings the first user-facing AI surface — a full chat experience."
        icon={Zap}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NextItem
            icon={Cpu}
            title="AI Chat (Phase 2)"
            description="A streaming chat UI backed by the 7-provider AI facade, with conversation history, model picker, and tool calling."
            badge="Next"
          />
          <NextItem
            icon={ScrollText}
            title="Read the roadmap"
            description="Master roadmap covers all 6 phases — chat, image generation, marketplace, business tools, observability."
            href="/MASTER_ROADMAP.md"
            hrefLabel="Open roadmap"
          />
        </div>
      </SectionCard>
    </div>
  );
}

function NextItem({
  icon: Icon,
  title,
  description,
  badge,
  href,
  hrefLabel,
}: {
  icon: typeof Zap;
  title: string;
  description: string;
  badge?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background/40 p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-muted text-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium">{title}</p>
        {badge ? (
          <Badge variant="outline" className="ml-auto border-brand text-brand">
            {badge}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground text-pretty">{description}</p>
      {href && hrefLabel ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand transition-opacity hover:opacity-80"
        >
          {hrefLabel}
          <span aria-hidden="true">→</span>
        </a>
      ) : null}
    </div>
  );
}
