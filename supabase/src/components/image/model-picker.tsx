"use client";

/**
 * Supa AI — Image model picker (Phase 4).
 *
 * A shadcn Select that lets the user pick which image provider + model
 * the next generation will use. Fetches the model catalog from
 * `/api/images/models` (which returns only providers with an API key
 * configured) and groups the models by provider in the dropdown.
 *
 * @module @/components/image/model-picker
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { useImageModels } from "@/hooks/use-images";
import type { ImageModelRow } from "@/lib/image/client";
import type { ImageProviderId } from "@/lib/ai/image-types";
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

/** Props accepted by {@link ModelPicker}. */
export interface ModelPickerProps {
  value: string | null;
  onValueChange: (provider: ImageProviderId, model: string) => void;
  /** Disable the trigger (e.g. while a generation is in flight). */
  disabled?: boolean;
  className?: string;
}

const PROVIDER_LABELS: Record<ImageProviderId, string> = {
  openai: "OpenAI",
  stability: "Stability AI",
  replicate: "Replicate",
  fal: "Fal.ai",
  ideogram: "Ideogram",
  google: "Google",
};

/** Group models by provider for the dropdown. */
function groupByProvider(models: ImageModelRow[]): {
  provider: ImageProviderId;
  label: string;
  models: ImageModelRow[];
}[] {
  const groups = new Map<ImageProviderId, ImageModelRow[]>();
  for (const m of models) {
    const arr = groups.get(m.provider as ImageProviderId) ?? [];
    arr.push(m);
    groups.set(m.provider as ImageProviderId, arr);
  }
  return [...groups.entries()].map(([provider, models]) => ({
    provider,
    label: PROVIDER_LABELS[provider] ?? provider,
    models,
  }));
}

export function ModelPicker({
  value,
  onValueChange,
  disabled,
  className,
}: ModelPickerProps) {
  const query = useImageModels();

  if (query.isLoading) {
    return <Skeleton className={cn("h-9 w-[220px]", className)} />;
  }

  const models = query.data ?? [];
  if (models.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        No image models configured.
      </div>
    );
  }

  const groups = groupByProvider(models);

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => {
        // The value is `${provider}:${model_id}`.
        const [provider, ...rest] = v.split(":");
        const model = rest.join(":");
        if (provider && model) {
          onValueChange(provider as ImageProviderId, model);
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger className={cn("w-[260px]", className)} aria-label="Image model">
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectGroup key={g.provider}>
            <SelectLabel>{g.label}</SelectLabel>
            {g.models.map((m) => (
              <SelectItem key={`${m.provider}:${m.model_id}`} value={`${m.provider}:${m.model_id}`}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
