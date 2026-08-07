"use client";

/**
 * Supa AI — Settings / General section.
 *
 * Read-only display of the app's identity + environment (name, URL,
 * environment, version, default AI provider / model, default payment
 * provider / currency). The values come from `env` + `constants/*` so they
 * are inherently server-derived; we render them in a definition list with a
 * copy button on the long ones.
 *
 * @module @/components/settings/sections/general-section
 */
import * as React from "react";
import { Globe, Server, Tag, Cpu, CreditCard } from "lucide-react";

import type { FoundationData } from "@/components/dashboard/foundation-data";
import { CopyButton } from "@/components/shared/copy-button";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

export interface GeneralSectionProps {
  data: FoundationData;
}

export function GeneralSection({ data }: GeneralSectionProps) {
  const rows: Array<{
    icon: typeof Globe;
    label: string;
    value: string;
    copyable?: boolean;
    toastName?: string;
  }> = [
    {
      icon: Tag,
      label: "App name",
      value: data.appName,
    },
    {
      icon: Globe,
      label: "App URL",
      value: data.appUrl,
      copyable: true,
      toastName: "App URL",
    },
    {
      icon: Server,
      label: "Environment",
      value: data.environment,
    },
    {
      icon: Tag,
      label: "Version",
      value: `v${data.version}`,
    },
    {
      icon: Cpu,
      label: "Default AI provider",
      value: `${data.defaultAiProvider} · ${data.defaultAiModel}`,
    },
    {
      icon: CreditCard,
      label: "Default payment provider",
      value: `${data.defaultPaymentProvider} · ${data.defaultCurrency.toUpperCase()}`,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Application identity</p>
        <p className="mt-1 text-xs text-muted-foreground">
          These values come from your <code className="font-mono">.env</code> file and are read-only in the UI.
          Update the underlying environment variables to change them.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="w-[36%] align-middle">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <row.icon className="size-3.5" aria-hidden="true" />
                    {row.label}
                  </span>
                </TableCell>
                <TableCell className="align-middle">
                  <div className="flex items-center justify-between gap-2">
                    <code className="font-mono text-xs break-all">{row.value}</code>
                    {row.copyable ? (
                      <CopyButton
                        value={row.value}
                        toastName={row.toastName}
                        label={`Copy ${row.toastName ?? row.label}`}
                      />
                    ) : null}
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
