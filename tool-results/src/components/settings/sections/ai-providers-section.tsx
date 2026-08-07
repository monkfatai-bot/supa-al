"use client";

/**
 * Supa AI — Settings / AI providers section.
 *
 * Renders the static `AI_PROVIDERS` catalog with a per-provider row showing:
 *
 *   - Label + docs link.
 *   - "Configured" / "Not configured" status (derived from `env.ai.providers[id].apiKey`).
 *   - Base URL when the provider uses one.
 *   - Masked API-key preview — `••••••••` + last 4 chars only. NEVER the raw key.
 *   - A "default" badge on the configured default provider.
 *
 * The whole grid is read-only in Phase 1 — adding / rotating keys is an
 * environment-variable change, not a UI action.
 *
 * @module @/components/settings/sections/ai-providers-section
 */
import * as React from "react";
import { ExternalLink, KeyRound, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FoundationData } from "@/components/dashboard/foundation-data";
import { CopyButton } from "@/components/shared/copy-button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface AiProvidersSectionProps {
  data: FoundationData;
}

export function AiProvidersSection({ data }: AiProvidersSectionProps) {
  const configuredCount = data.aiProviders.filter((p) => p.configured).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium">AI provider credentials</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Status reflects your <code className="font-mono">.env</code> file. Keys are masked and never exposed in the DOM.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{configuredCount}</span>
          {" / "}
          <span>{data.aiProviders.length} configured</span>
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
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
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{provider.label}</span>
                      {provider.isDefault ? (
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          Default
                        </Badge>
                      ) : null}
                    </div>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Docs
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
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
                      <Server className="size-3 text-muted-foreground" aria-hidden="true" />
                      <code className="font-mono text-xs break-all">{provider.baseUrl}</code>
                      <CopyButton
                        value={provider.baseUrl}
                        toastName="Base URL"
                        label="Copy base URL"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <KeyRound
                      className={cn(
                        "size-3",
                        provider.configured ? "text-brand" : "text-muted-foreground/60",
                      )}
                      aria-hidden="true"
                    />
                    <code className="font-mono text-xs">
                      {provider.keyPreview}
                    </code>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
