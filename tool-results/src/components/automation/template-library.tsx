"use client";

/**
 * Supa AI — Phase 9A Automation — template library.
 *
 * Renders a searchable, filterable grid of automation templates. Each
 * card shows the template's name, description, category badge, install
 * count, and an "Install" button that creates a new workflow from the
 * template's `config`.
 *
 * @module @/components/automation/template-library
 */
import * as React from "react";
import { Download, Search, Sparkles, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AutomationTemplate } from "@/lib/automation/client";
import { useTemplates } from "@/hooks/use-automation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export interface TemplateLibraryProps {
  /** Called when the user clicks "Install" on a template. */
  onInstall?: (template: AutomationTemplate) => void;
  /** Optional pre-selected category. */
  defaultCategory?: string;
  className?: string;
}

const CATEGORIES = [
  "general",
  "marketing",
  "operations",
  "sales",
  "content",
  "engineering",
  "research",
];

export function TemplateLibrary({
  onInstall,
  defaultCategory,
  className,
}: TemplateLibraryProps) {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>(defaultCategory ?? "all");
  const debounced = React.useDeferredValue(search);

  const templatesQuery = useTemplates({
    search: debounced || undefined,
    category: category === "all" ? undefined : category,
    limit: 60,
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {templatesQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : templatesQuery.data && templatesQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templatesQuery.data.map((t) => (
            <TemplateCard key={t.id} template={t} onInstall={onInstall} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Sparkles}
          title="No templates found"
          description="Try a different search or category — new templates are published regularly."
        />
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: AutomationTemplate;
  onInstall?: (template: AutomationTemplate) => void;
}

function TemplateCard({ template, onInstall }: TemplateCardProps) {
  return (
    <div className="flex flex-col rounded-lg border bg-background p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
        </span>
        {template.is_featured ? (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300"
          >
            <Star className="size-3" aria-hidden="true" />
            Featured
          </Badge>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-medium">{template.name}</p>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-3">
        {template.description ?? "No description."}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {template.category}
        </Badge>
        <span className="inline-flex items-center gap-1">
          <Download className="size-3" aria-hidden="true" />
          {template.install_count}
        </span>
      </div>
      <div className="mt-3 flex-1" />
      {onInstall ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => onInstall(template)}
        >
          <Download className="size-3.5" aria-hidden="true" />
          Install
        </Button>
      ) : null}
    </div>
  );
}
