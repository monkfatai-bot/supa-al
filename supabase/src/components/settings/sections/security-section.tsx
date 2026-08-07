"use client";

/**
 * Supa AI — Settings / Security section.
 *
 * Surfaces the security posture of the running instance — masked secrets
 * (auth secret, JWT secret, encryption key — first 4 + last 4 chars only),
 * the rate-limit preset table, and upload constraints (max size + allowed
 * MIME types).
 *
 * Every secret field is masked. We never render the raw value, even on
 * hover — the masked preview is the only secret-derived information that
 * crosses the server/client boundary.
 *
 * @module @/components/settings/sections/security-section
 */
import * as React from "react";
import { FileUp, Gauge, Lock, ShieldCheck } from "lucide-react";

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

export interface SecuritySectionProps {
  data: FoundationData;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatWindow(ms: number): string {
  if (ms >= 60 * 60 * 1000) {
    const hours = ms / (60 * 60 * 1000);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (ms >= 60 * 1000) {
    const minutes = ms / (60 * 1000);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${ms / 1000} seconds`;
}

export function SecuritySection({ data }: SecuritySectionProps) {
  const secrets: Array<{
    id: string;
    label: string;
    icon: typeof Lock;
    status: { configured: boolean; maskedPreview: string };
  }> = [
    {
      id: "auth-secret",
      label: "AUTH_SECRET",
      icon: Lock,
      status: data.authSecret,
    },
    {
      id: "jwt-secret",
      label: "JWT_SECRET",
      icon: ShieldCheck,
      status: data.jwtSecret,
    },
    {
      id: "encryption-key",
      label: "ENCRYPTION_KEY",
      icon: Lock,
      status: data.encryptionKey,
    },
  ];

  const presets = Object.entries(data.rateLimitPresets) as Array<
    [string, { windowMs: number; max: number }]
  >;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium">Application secrets</p>
        <p className="mt-1 text-xs text-muted-foreground">
          These power session signing, JWT issuance, and field-level encryption. Masked previews show only the first 4 + last 4 characters.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableBody>
            {secrets.map((secret) => (
              <TableRow key={secret.id}>
                <TableCell className="w-[36%] align-middle">
                  <span className="flex items-center gap-2 text-sm">
                    <secret.icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    <code className="font-mono text-xs">{secret.label}</code>
                  </span>
                </TableCell>
                <TableCell className="align-middle">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        status={secret.status.configured ? "ok" : "error"}
                        label={secret.status.configured ? "Configured" : "Missing"}
                      />
                      <code className="font-mono text-xs text-muted-foreground">
                        {secret.status.maskedPreview}
                      </code>
                    </div>
                    {secret.status.configured ? (
                      <CopyButton
                        value={secret.status.maskedPreview}
                        toastName="Masked preview"
                        label="Copy masked preview"
                      />
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Rate-limit presets</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Named presets applied to API routes by family. Sliding window per IP + per user.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preset</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Max requests</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {presets.map(([name, cfg]) => (
              <TableRow key={name}>
                <TableCell>
                  <code className="font-mono text-xs">{name}</code>
                </TableCell>
                <TableCell className="text-sm">{formatWindow(cfg.windowMs)}</TableCell>
                <TableCell className="text-sm tabular-nums">{cfg.max}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <FileUp className="size-4 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Upload limits</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Hard ceiling on file size + the MIME-type allow-list enforced by the upload pipeline.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">Max file size</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {formatBytes(data.uploadMaxBytes)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enforced by <code className="font-mono">validateUpload()</code>.
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">Allowed MIME types</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.uploadAllowedMimeTypes.map((mime) => (
              <span
                key={mime}
                className="inline-flex items-center rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                {mime}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
