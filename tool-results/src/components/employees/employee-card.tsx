"use client";

/**
 * Supa AI — Phase 9C Employee card.
 *
 * Compact presentational card for a single employee in the directory
 * grid. Shows:
 *   - Avatar (or initials fallback)
 *   - Name + role
 *   - Department + experience-level badges
 *   - Status indicator (active / paused / archived / training / busy)
 *   - Skills summary (up to 3, "+N" overflow)
 *   - Primary action button ("Hire" for templates, "Open" otherwise)
 *
 * Clicking the card opens the profile drawer (via `onOpen`).
 *
 * @module @/components/employees/employee-card
 */
import * as React from "react";
import { Bot, Sparkles, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EmployeeWithRelations } from "@/lib/employees/client";
import { skillRegistry } from "@/lib/employees/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

export interface EmployeeCardProps {
  employee: EmployeeWithRelations;
  /** Called when the user clicks the card body. */
  onOpen?: (employee: EmployeeWithRelations) => void;
  /** Called when the user clicks the primary action button. */
  onAction?: (employee: EmployeeWithRelations) => void;
  /** Override the action button label. Defaults to "Hire" for templates, "Open" otherwise. */
  actionLabel?: string;
  className?: string;
}

const STATUS_STYLES: Record<EmployeeWithRelations["status"], string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  archived: "bg-muted-foreground/40",
  training: "bg-sky-500",
  busy: "bg-violet-500",
};

const STATUS_LABEL: Record<EmployeeWithRelations["status"], string> = {
  active: "Active",
  paused: "Paused",
  archived: "Archived",
  training: "Training",
  busy: "Busy",
};

const EXPERIENCE_LABEL: Record<EmployeeWithRelations["experience_level"], string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  expert: "Expert",
};

/** Derive 2-letter initials from the employee name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

export function EmployeeCard({
  employee,
  onOpen,
  onAction,
  actionLabel,
  className,
}: EmployeeCardProps) {
  const skills = employee.skills.slice(0, 3);
  const overflow = Math.max(0, employee.skills.length - 3);

  const handleActionClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAction?.(employee);
    },
    [employee, onAction],
  );

  const handleOpen = React.useCallback(() => {
    onOpen?.(employee);
  }, [employee, onOpen]);

  const label =
    actionLabel ?? (employee.is_template ? "Hire" : "Open");

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        "group relative cursor-pointer overflow-hidden transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <div className="relative">
          <Avatar className="size-12">
            {employee.avatar_url ? (
              <AvatarImage src={employee.avatar_url} alt={employee.name} />
            ) : null}
            <AvatarFallback className="bg-muted text-sm font-semibold">
              {employee.is_template ? (
                <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
              ) : (
                initials(employee.name)
              )}
            </AvatarFallback>
          </Avatar>
          <span
            aria-label={`Status: ${STATUS_LABEL[employee.status]}`}
            title={STATUS_LABEL[employee.status]}
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
              STATUS_STYLES[employee.status],
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold leading-tight">
              {employee.name}
            </h3>
            {employee.is_template ? (
              <Sparkles className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {employee.role}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="secondary" className="text-[10px] font-medium">
              {employee.department}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-medium">
              {EXPERIENCE_LABEL[employee.experience_level]}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {employee.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground text-pretty">
            {employee.description}
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground/70">
            No description provided.
          </p>
        )}

        {skills.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {skills.map((s) => {
              const def = skillRegistry.find(s.skill_name);
              return (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="text-[10px] font-medium text-muted-foreground"
                >
                  {def?.label ?? s.skill_name}
                </Badge>
              );
            })}
            {overflow > 0 ? (
              <Badge
                variant="outline"
                className="text-[10px] font-medium text-muted-foreground"
              >
                +{overflow}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="pt-0">
        <Button
          size="sm"
          variant={employee.is_template ? "default" : "secondary"}
          className="w-full gap-1.5"
          onClick={handleActionClick}
        >
          <Zap className="size-3.5" aria-hidden="true" />
          {label}
        </Button>
      </CardFooter>
    </Card>
  );
}
