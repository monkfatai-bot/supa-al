"use client";

/**
 * Supa AI — Dashboard footer.
 *
 * Sticky footer (mt-auto on the root wrapper) that surfaces the
 * environment the app is running in, the version, and a few doc links.
 * Renders compactly on mobile (stacked) and inline on `sm+`.
 *
 * @module @/components/dashboard/dashboard-footer
 */
import * as React from "react";
import { FileText, Github } from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME, APP_VERSION } from "@/lib/constants/app";
import { StatusBadge, type StatusBadgeStatus } from "@/components/shared/status-badge";

export interface DashboardFooterProps {
  /**
   * Runtime environment label, threaded from the server component via the
   * shell. Read as a prop (not via `@/lib/config/env`) because this is a
   * client component and the `env` module validates server-only secrets that
   * are undefined in the browser bundle.
   */
  environment: "development" | "staging" | "production";
  className?: string;
}

const ENV_STATUS: Record<string, StatusBadgeStatus> = {
  development: "warning",
  staging: "ok",
  production: "ok",
};

const ENV_LABEL: Record<string, string> = {
  development: "Dev",
  staging: "Staging",
  production: "Production",
};

export function DashboardFooter({
  environment,
  className,
}: DashboardFooterProps) {
  const year = new Date().getFullYear();
  const envStatus = ENV_STATUS[environment] ?? "disabled";
  const envLabel = ENV_LABEL[environment] ?? environment;

  return (
    <footer
      className={cn(
        "mt-auto border-t bg-background/60 px-4 py-3 backdrop-blur-sm sm:px-6",
        className,
      )}
      role="contentinfo"
    >
      <div className="mx-auto flex max-w-screen-2xl flex-col items-start justify-between gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            © {year} {APP_NAME}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge status={envStatus} label={envLabel} />
          </span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span>v{APP_VERSION}</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-3">
          <a
            href="/README.md"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            README
          </a>
          <a
            href="/PROJECT_ARCHITECTURE.md"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText className="size-3.5" aria-hidden="true" />
            Architecture
          </a>
          <a
            href="https://github.com/supa-ai"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Github className="size-3.5" aria-hidden="true" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
