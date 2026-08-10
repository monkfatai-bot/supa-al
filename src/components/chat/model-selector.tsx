"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAvailableProviders, getModelsByProvider } from "@/services/ai/models";

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function ModelSelector({ value, onValueChange }: ModelSelectorProps) {
  const providers = getAvailableProviders();

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {providers.map((providerId) => {
          const models = getModelsByProvider(providerId);
          if (models.length === 0) return null;
          return (
            <SelectGroup key={providerId}>
              <SelectLabel className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {models[0].provider}
              </SelectLabel>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center gap-2">
                    <span>{model.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
