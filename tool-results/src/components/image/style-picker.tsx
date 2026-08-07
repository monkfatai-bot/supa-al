"use client";

/**
 * Supa AI — Image style picker (Phase 4).
 *
 * A shadcn Select for choosing an image style preset (photographic,
 * anime, …). Fetches the catalog from `/api/images/styles`.
 *
 * @module @/components/image/style-picker
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { useImageStyles } from "@/hooks/use-images";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

/** Props accepted by {@link StylePicker}. */
export interface StylePickerProps {
  value: string | null;
  onValueChange: (style: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function StylePicker({
  value,
  onValueChange,
  disabled,
  className,
}: StylePickerProps) {
  const query = useImageStyles();

  if (query.isLoading) {
    return <Skeleton className={cn("h-9 w-[180px]", className)} />;
  }

  const styles = query.data ?? [];
  if (styles.length === 0) {
    return null;
  }

  // Group by category.
  const grouped = new Map<string, typeof styles>();
  for (const s of styles) {
    const arr = grouped.get(s.category) ?? [];
    arr.push(s);
    grouped.set(s.category, arr);
  }

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(v) => onValueChange(v === "__none__" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-[200px]", className)} aria-label="Image style">
        <SelectValue placeholder="No style" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No style</SelectItem>
        {[...grouped.entries()].map(([category, items]) => (
          <SelectGroup key={category}>
            <SelectLabel className="capitalize">{category}</SelectLabel>
            {items.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
