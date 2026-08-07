"use client";

/**
 * Supa AI — Model catalog table (admin overview).
 *
 * Presentational table of every model returned by `GET /api/chat/models`.
 * Columns: Provider, Model, Context Window, Max Output, Input Cost/1K,
 * Output Cost/1K, Tier, Status (enabled/disabled badge).
 *
 * Sortable by provider (asc/desc) and input cost/1K (asc/desc). Filterable
 * by provider via a shadcn `Select` dropdown. Uses shadcn `Table` and
 * horizontally scrolls on narrow viewports.
 *
 * HONEST CAVEAT: the `/api/chat/models` route filters server-side to
 * enabled models from configured providers only. So every row in this
 * table is implicitly "Enabled" — the Status column reflects that. A
 * future admin endpoint can return the full catalog (including disabled
 * models and unconfigured providers) so operators can toggle individual
 * models; until then, the table shows what users actually see in the
 * picker.
 *
 * @module @/components/admin/model-catalog-table
 */
import * as React from "react";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CatalogModel,
  CatalogProviderGroup,
} from "@/hooks/use-admin";

export interface ModelCatalogTableProps {
  /** Provider groups from `/api/chat/models`. */
  groups: CatalogProviderGroup[];
  className?: string;
}

/** Sortable columns. */
type SortKey = "provider" | "inputCost";
type SortDir = "asc" | "desc";

/** Flatten the grouped catalog into a per-row shape with provider info. */
interface Row {
  provider: string;
  providerLabel: string;
  model: CatalogModel;
}

/** ALL_PROVIDERS sentinel for the filter dropdown. */
const ALL_PROVIDERS = "__all__";

/** Format a context window with K/M suffix (e.g. 128_000 → "128K"). */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${Math.round(n / 1000)}K`;
  }
  return n.toLocaleString();
}

/** Format a cost-per-1K value. Cents are fractional (e.g. 0.15 → "$0.0015/1K"). */
function formatCostPer1K(centsPer1K: number): string {
  if (centsPer1K === 0) return "Free";
  const usdPer1K = centsPer1K / 100;
  if (usdPer1K < 0.01) {
    return `$${usdPer1K.toFixed(4)}/1K`;
  }
  return `$${usdPer1K.toFixed(3)}/1K`;
}

/** Tier → badge variant. */
const TIER_BADGE: Record<
  CatalogModel["tier"],
  { className: string; label: string }
> = {
  free: {
    className:
      "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    label: "Free",
  },
  starter: {
    className:
      "border-transparent bg-teal-500/10 text-teal-700 dark:text-teal-300",
    label: "Starter",
  },
  pro: {
    className:
      "border-transparent bg-purple-500/10 text-purple-700 dark:text-purple-300",
    label: "Pro",
  },
  business: {
    className:
      "border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300",
    label: "Business",
  },
  enterprise: {
    className:
      "border-transparent bg-rose-500/10 text-rose-700 dark:text-rose-300",
    label: "Enterprise",
  },
};

export function ModelCatalogTable({
  groups,
  className,
}: ModelCatalogTableProps) {
  // Flatten to a row-per-model array.
  const allRows: Row[] = React.useMemo(() => {
    return groups.flatMap((g) =>
      g.models.map((m) => ({
        provider: g.provider,
        providerLabel: g.label,
        model: m,
      })),
    );
  }, [groups]);

  // Unique providers for the filter dropdown.
  const providerOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of groups) {
      seen.set(g.provider, g.label);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [groups]);

  const [providerFilter, setProviderFilter] = React.useState<string>(ALL_PROVIDERS);
  const [sortKey, setSortKey] = React.useState<SortKey>("provider");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // Apply filter + sort.
  const rows = React.useMemo(() => {
    let result = allRows;
    if (providerFilter !== ALL_PROVIDERS) {
      result = result.filter((r) => r.provider === providerFilter);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      if (sortKey === "provider") {
        const cmp = a.providerLabel.localeCompare(b.providerLabel);
        if (cmp !== 0) return cmp * dir;
        // Tiebreak by model label for stable ordering.
        return a.model.label.localeCompare(b.model.label);
      }
      // inputCost
      const cmp =
        (a.model.inputCostCentsPer1K ?? 0) -
        (b.model.inputCostCentsPer1K ?? 0);
      if (cmp !== 0) return cmp * dir;
      return a.model.label.localeCompare(b.model.label);
    });
    return result;
  }, [allRows, providerFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar: provider filter + sort hints ----------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger size="sm" className="h-8 w-44" aria-label="Filter by provider">
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROVIDERS}>All providers</SelectItem>
              {providerOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          {rows.length} model{rows.length === 1 ? "" : "s"}
        </p>
      </div>

      <Separator />

      {/* Table -------------------------------------------------------- */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton
                  label="Provider"
                  active={sortKey === "provider"}
                  dir={sortDir}
                  onClick={() => toggleSort("provider")}
                />
              </TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Context</TableHead>
              <TableHead className="text-right">Max Output</TableHead>
              <TableHead>
                <SortButton
                  label="Input / 1K"
                  active={sortKey === "inputCost"}
                  dir={sortDir}
                  onClick={() => toggleSort("inputCost")}
                />
              </TableHead>
              <TableHead>Output / 1K</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-muted-foreground">
                  No models match this filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const tierMeta = TIER_BADGE[row.model.tier] ?? TIER_BADGE.free;
                return (
                  <TableRow key={`${row.provider}:${row.model.id}`}>
                    <TableCell className="font-medium">
                      {row.providerLabel}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.model.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {row.model.id}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokenCount(row.model.contextWindow)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokenCount(row.model.maxOutputTokens)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCostPer1K(row.model.inputCostCentsPer1K)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatCostPer1K(row.model.outputCostCentsPer1K)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-medium", tierMeta.className)}
                      >
                        {tierMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* The route only returns enabled models from
                          configured providers — every row is implicitly
                          "Enabled". A future admin endpoint can expose the
                          full catalog so this column reflects actual
                          enabled/disabled state. */}
                      <Badge
                        variant="outline"
                        className="border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        Enabled
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-[11px] text-muted-foreground text-pretty">
        The catalog endpoint returns only enabled models from providers with
        an API key configured — every row is implicitly{" "}
        <span className="font-medium">Enabled</span>. Disabled models and
        unconfigured providers are hidden server-side.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sort button (column header)
// ---------------------------------------------------------------------------

interface SortButtonProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}

function SortButton({ label, active, dir, onClick }: SortButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 gap-1 px-1 text-xs font-medium hover:bg-transparent",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
      aria-label={`Sort by ${label}, currently ${active ? dir : "unsorted"}`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="size-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3" aria-hidden="true" />
        )
      ) : null}
    </Button>
  );
}
