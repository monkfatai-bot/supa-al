"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_IMAGE_MODELS } from "@/services/image";

interface ModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onValueChange, disabled = false }: ModelSelectorProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_IMAGE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex flex-col items-start">
              <span>{model.name}</span>
              <span className="text-muted-foreground text-xs">
                {model.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
