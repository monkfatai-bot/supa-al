"use client";

/**
 * Supa AI — Phase 9C Employee directory.
 *
 * The "hire / browse" surface — a searchable, filterable grid of
 * employee cards. Filters:
 *   - Search box (matches name + role + description via the API).
 *   - Department dropdown (sourced from `/api/employees/departments`).
 *   - Status dropdown (active / paused / archived).
 *
 * Cards are rendered in a responsive grid (1 col mobile, 2 col sm,
 * 3 col lg, 4 col xl). The grid scrolls vertically inside the
 * dashboard content area.
 *
 * Clicking a card opens the profile drawer (via `onSelect`).
 *
 * @module @/components/employees/employee-directory
 */
import * as React from "react";
import { Bot, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EmployeeWithRelations } from "@/lib/employees/client";
import type { EmployeeStatus } from "@/lib/employees/client";
import { useDepartments, useEmployees } from "@/hooks/use-employees";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

import { EmployeeCard } from "./employee-card";

export interface EmployeeDirectoryProps {
  /** Called when the user clicks a card. */
  onSelect?: (employee: EmployeeWithRelations) => void;
  /** Called when the user clicks the "Hire" / "Open" action button. */
  onAction?: (employee: EmployeeWithRelations) => void;
  className?: string;
}

export function EmployeeDirectory({
  onSelect,
  onAction,
  className,
}: EmployeeDirectoryProps) {
  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState<string>("");
  const [status, setStatus] = React.useState<EmployeeStatus | "">("");

  // Debounce the search input by 250ms so we don't fire a query per
  // keystroke.
  const debouncedSearch = React.useDeferredValue(search);

  const employeesQuery = useEmployees({
    search: debouncedSearch || undefined,
    department: department || undefined,
    status: status || undefined,
    limit: 60,
  });
  const departmentsQuery = useDepartments();

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search employees by name, role, or skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search employees"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={department || "all"}
            onValueChange={(v) => setDepartment(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[160px]" aria-label="Filter by department">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {(departmentsQuery.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || "all"}
            onValueChange={(v) =>
              setStatus(v === "all" ? "" : (v as EmployeeStatus))
            }
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="training">Training</SelectItem>
              <SelectItem value="busy">Busy</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grid */}
      {employeesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-lg" />
          ))}
        </div>
      ) : employeesQuery.isError ? (
        <EmptyState
          icon={Bot}
          title="Couldn't load employees"
          description={
            employeesQuery.error instanceof Error
              ? employeesQuery.error.message
              : "Please try again."
          }
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => employeesQuery.refetch()}
            >
              Retry
            </Button>
          }
        />
      ) : (((employeesQuery.data ?? [])) as unknown[]).length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No employees yet"
          description="Hire your first AI employee from the Marketplace tab, or create one from scratch with the New Employee button."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(employeesQuery.data ?? []).map((emp) => (
            <EmployeeCard
              key={emp.id as string}
              employee={emp}
              onOpen={onSelect}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
