"use client";

/**
 * Supa AI — Feature comparison section.
 *
 * Tabular comparison of the 5 pricing tiers across 12 features. The cell
 * value can be a boolean (✓ / ✕) or a string label.
 *
 * @module @/components/marketing/sections/feature-comparison
 */
import * as React from "react";
import { Check, Minus } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COMPARISON_ROWS, PRICING_TIERS } from "../marketing-data";

function ComparisonCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  if (value) {
    return <Check className="size-4 text-emerald-600" aria-label="Included" />;
  }
  return <Minus className="size-4 text-muted-foreground/40" aria-label="Not included" />;
}

export function FeatureComparisonSection() {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8"
      aria-labelledby="comparison-headline"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-600">
          Compare plans
        </p>
        <h2
          id="comparison-headline"
          className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
        >
          Every feature, side-by-side
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          What you get at each tier. All plans include self-hosting.
        </p>
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Feature</TableHead>
              {PRICING_TIERS.map((tier) => (
                <TableHead key={tier.id} className="text-center">
                  <span className="block text-sm font-semibold">{tier.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {tier.custom
                      ? "Custom"
                      : tier.monthly === 0
                        ? "Free"
                        : `$${tier.monthly}/mo`}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {COMPARISON_ROWS.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">{row.feature}</TableCell>
                <TableCell className="text-center"><ComparisonCell value={row.free} /></TableCell>
                <TableCell className="text-center"><ComparisonCell value={row.starter} /></TableCell>
                <TableCell className="text-center"><ComparisonCell value={row.pro} /></TableCell>
                <TableCell className="text-center"><ComparisonCell value={row.business} /></TableCell>
                <TableCell className="text-center"><ComparisonCell value={row.enterprise} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
