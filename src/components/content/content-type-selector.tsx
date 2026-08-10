"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONTENT_TYPE_OPTIONS } from "@/services/content";
import type { ContentType } from "@/services/content";

interface ContentTypeSelectorProps {
  value: ContentType;
  onValueChange: (value: ContentType) => void;
}

export function ContentTypeSelector({
  value,
  onValueChange,
}: ContentTypeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as ContentType)}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select type" />
      </SelectTrigger>
      <SelectContent>
        {CONTENT_TYPE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <div className="flex flex-col items-start">
              <span>{opt.label}</span>
              <span className="text-muted-foreground text-xs">
                {opt.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
