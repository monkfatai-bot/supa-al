import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Supa AI — Section card.
 *
 * A titled, optionally-described Card wrapper used by dashboard sections to
 * keep visual rhythm consistent. The `footer` slot sticks to the bottom of
 * the card so multiple cards in a grid line up regardless of body length.
 *
 * @module @/components/shared/section-card
 */
export interface SectionCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned slot in the header — e.g. a "View all" link or badge. */
  action?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  footer,
  className,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b py-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-xs text-pretty">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("p-4 sm:p-6", contentClassName)}>
        {children}
      </CardContent>
      {footer ? (
        <div className="border-t bg-muted/30 px-4 py-3 sm:px-6">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}
