"use client";

import { useRef, FormEvent } from "react";
import { Textarea } from "@/components/ui/textarea";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

export function PromptInput({ value, onChange, onSubmit, disabled = false }: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the image you want to create..."
        disabled={disabled}
        rows={3}
        className="min-h-[80px] max-h-[200px] resize-none"
      />
      <p className="text-muted-foreground text-xs">
        Press Ctrl+Enter to generate
      </p>
    </form>
  );
}
