"use client";

import { Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GenerateButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export function GenerateButton({ onClick, disabled = false, isGenerating = false }: GenerateButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || isGenerating}
      className="w-full sm:w-auto"
    >
      {isGenerating ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="mr-2 h-4 w-4" />
      )}
      {isGenerating ? "Generating..." : "Generate Image"}
    </Button>
  );
}
