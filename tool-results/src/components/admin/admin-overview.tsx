"use client";

/**
 * Supa AI — Admin overview (Phase 3 monitoring dashboard).
 *
 * The single admin monitoring surface, rendered inside the `/` route when
 * the dashboard section is `'admin'`. Wires together every Phase 3 chat
 * monitoring read endpoint into a single scrollable page:
 *
 *   1. Hero header with the access-control check.
 *   2. Provider Health grid (one {@link ProviderHealthCard} per provider).
 *   3. Usage metrics row (4 stat cards: requests, tokens, cost, error rate).
 *   4. Two-column charts row: provider latency bar chart + error-rate
 *      placeholder area chart.
 *   5. Model catalog table (filterable + sortable).
 *
 * ACCESS CONTROL: only `super_admin` and `admin` platform roles may view
 * this surface. The role is read from the `AuthUser.app_metadata.platform_role`
 * claim (set on signup). Non-admin users see an `EmptyState` with a lock
 * icon and a clear "You need admin access" message — they can navigate
 * back to other dashboard sections via the sidebar.
 *
 * HONEST CAVEATS surfaced inline:
 *   - The `/api/chat/usage` endpoint is scoped to the *caller* — it does
 *     NOT aggregate across all users. The usage row reflects the current
 *     admin's own usage as a proxy. A true admin-wide view requires a
 *     server-side aggregation endpoint over `ai_usage` (Phase 4+).
 *   - The error-rate time-series chart is a placeholder — Phase 3 has no
 *     per-day aggregation endpoint. The placeholder renders an honest
 *     note rather than fabricated data.
 *
 * @module @/components/admin/admin-overview
 */
import * as React from "react";
import {
  AlertCircle,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AuthUser } from "@/lib/auth";
import {
  isPlatformRole,
  type PlatformRole,
} from "@/lib/auth/permissions";
import {
  useAdminUsage,
  useModelCatalog,
  useProviderHealth,
} from "@/hooks/use-admin";

import { ErrorRateChart } from "./error-rate-chart";
import { LatencyChart } from "./latency-chart";
import { ModelCatalogTable } from "./model-catalog-table";
import { ProviderHealthCard } from "./provider-health-card";
import { UsageMetrics } from "./usage-metrics";

export interface AdminOverviewProps {
  /** The authenticated user. Used for the access-control check. */
  user: AuthUser | null;
  className?: string;
}

/** Read the platform role from the user's `app_metadata` claim. */
function readPlatformRole(user: AuthUser | null): PlatformRole | null {
  const raw = user?.app_metadata?.platform_role;
  if (typeof raw === "string" && isPlatformRole(raw)) {
    return raw;
  }
  return null;
}

/** Is this user authorized to view the admin surface? */
function isAdminAuthorized(user: AuthUser | null): boolean {
  const role = readPlatformRole(user);
  return role === "super_admin" || role === "admin";
}

export function AdminOverview({ user, className }: AdminOverviewProps) {
  // Access control — render the locked EmptyState for non-admins.
  if (!isAdminAuthorized(user)) {
    return (
      <div className={cn("p-4 sm:p-6 lg:p-8", className)}>
        <div className="mb-6 flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Admin
          </h1>
        </div>
        <EmptyState
          icon={Lock}
          title="You need admin access to view this page."
          description="This surface is restricted to users with the Admin or Super Admin platform role. If you believe you should have access, contact your workspace owner."
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("space-y-6 p-4 sm:p-6 lg:p-8", className)}>
        <AdminHeader user={user} />

        <UsageSection />

        <ChartsSection />

        <HealthSection />

        <CatalogSection />
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

interface AdminHeaderProps {
  user: AuthUser | null;
}

function AdminHeader({ user }: AdminHeaderProps) {
  const role = readPlatformRole(user);
  const roleLabel = role === "super_admin" ? "Super Admin" : "Admin";

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          >
            <ShieldCheck className="size-5" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Admin Monitoring
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {roleLabel}
              </span>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              Real-time provider health, usage metrics, and the model catalog
              for the Supa AI platform.
            </p>
          </div>
        </div>
      </div>

      {/* Honest scope caveat --------------------------------------- */}
      <div
        className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
        role="note"
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <p className="text-pretty">
          <span className="font-medium">Scope:</span> usage figures reflect
          the current admin&apos;s account, not platform-wide totals. A
          server-side aggregation endpoint over{" "}
          <code className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[10px]">
            ai_usage
          </code>{" "}
          is required for org-wide metrics (Phase 4+).
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Usage metrics section
// ---------------------------------------------------------------------------

function UsageSection() {
  const healthQuery = useProviderHealth();
  const usageQuery = useAdminUsage();

  // Derive the aggregated error rate from the health snapshot.
  // (`totalErrors / totalRequests` across every provider row.)
  const aggregatedErrorRate = React.useMemo(() => {
    const providers = healthQuery.data?.providers ?? [];
    let totalReq = 0;
    let totalErr = 0;
    for (const p of providers) {
      totalReq += p.success_count + p.error_count;
      totalErr += p.error_count;
    }
    if (totalReq === 0) return 0;
    return totalErr / totalReq;
  }, [healthQuery.data]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Usage metrics
          </h2>
          <p className="text-xs text-muted-foreground">
            Month-to-date · your account (see scope note above).
          </p>
        </div>
        <RefreshButton
          isFetching={usageQuery.isFetching || healthQuery.isFetching}
          onClick={() => {
            void usageQuery.refetch();
            void healthQuery.refetch();
          }}
        />
      </div>

      {usageQuery.isLoading ? (
        <UsageMetricsSkeleton />
      ) : usageQuery.isError ? (
        <ErrorInline
          message="Couldn't load usage metrics."
          onRetry={() => void usageQuery.refetch()}
        />
      ) : usageQuery.data ? (
        <UsageMetrics
          requestCount={usageQuery.data.requestCount}
          totalTokens={usageQuery.data.totalTokens}
          totalCostCents={usageQuery.data.totalCostCents}
          errorRate={aggregatedErrorRate}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Charts section (latency + error rate placeholder)
// ---------------------------------------------------------------------------

function ChartsSection() {
  const healthQuery = useProviderHealth();

  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <SectionCard
        title="Provider Latency"
        description="Average response time per provider."
        icon={Zap}
        contentClassName="p-4 sm:p-5"
      >
        {healthQuery.isLoading ? (
          <ChartSkeleton />
        ) : healthQuery.isError ? (
          <ErrorInline
            message="Couldn't load provider health."
            onRetry={() => void healthQuery.refetch()}
          />
        ) : (
          <LatencyChart providers={healthQuery.data?.providers ?? []} />
        )}
      </SectionCard>

      <SectionCard
        title="Error Rate (7 days)"
        description="Daily error rate trend across providers."
        icon={AlertCircle}
        contentClassName="p-4 sm:p-5"
      >
        <ErrorRateChart />
      </SectionCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Provider health grid
// ---------------------------------------------------------------------------

function HealthSection() {
  const healthQuery = useProviderHealth();
  const providers = healthQuery.data?.providers ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Provider Health
          </h2>
          <p className="text-xs text-muted-foreground">
            Rolling per-provider metrics from the last N requests.
          </p>
        </div>
        <RefreshButton
          isFetching={healthQuery.isFetching}
          onClick={() => void healthQuery.refetch()}
        />
      </div>

      {healthQuery.isLoading ? (
        <HealthGridSkeleton />
      ) : healthQuery.isError ? (
        <ErrorInline
          message="Couldn't load provider health."
          onRetry={() => void healthQuery.refetch()}
        />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No provider activity yet"
          description="Once AI requests start flowing through the chat service, each provider's rolling health snapshot will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {providers.map((entry) => (
            <ProviderHealthCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Model catalog
// ---------------------------------------------------------------------------

function CatalogSection() {
  const modelsQuery = useModelCatalog();

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Model Catalog
          </h2>
          <p className="text-xs text-muted-foreground">
            All models exposed to users. Filter by provider, sort by cost.
          </p>
        </div>
        <RefreshButton
          isFetching={modelsQuery.isFetching}
          onClick={() => void modelsQuery.refetch()}
        />
      </div>

      <SectionCard
        title="Models"
        description="Enabled models from configured providers."
        icon={ShieldCheck}
        contentClassName="p-4 sm:p-5"
      >
        {modelsQuery.isLoading ? (
          <TableSkeleton />
        ) : modelsQuery.isError ? (
          <ErrorInline
            message="Couldn't load the model catalog."
            onRetry={() => void modelsQuery.refetch()}
          />
        ) : (
          <ModelCatalogTable groups={modelsQuery.data?.groups ?? []} />
        )}
      </SectionCard>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Loading + error primitives
// ---------------------------------------------------------------------------

function UsageMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-56 w-full rounded-md" />;
}

function HealthGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-full rounded-xl" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

interface ErrorInlineProps {
  message: string;
  onRetry: () => void;
}

function ErrorInline({ message, onRetry }: ErrorInlineProps) {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-destructive dark:text-red-400"
          aria-hidden="true"
        />
        <p className="text-xs text-destructive dark:text-red-400 text-pretty">
          {message}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="gap-1.5 text-xs"
      >
        <RefreshCw className="size-3" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refresh button
// ---------------------------------------------------------------------------

interface RefreshButtonProps {
  isFetching: boolean;
  onClick: () => void;
}

function RefreshButton({ isFetching, onClick }: RefreshButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={isFetching}
      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      aria-label="Refresh data"
    >
      <RefreshCw
        className={cn("size-3.5", isFetching && "animate-spin")}
        aria-hidden="true"
      />
      Refresh
    </Button>
  );
}
