"use client";

/**
 * Supa AI — Image studio (Phase 4 generate surface).
 *
 * The prompt-input + model picker + style picker + size picker +
 * generate button + result display. Owns the local form state
 * (prompt, provider, model, style, size, quality) and calls
 * `useGenerateImage` on submit.
 *
 * @module @/components/image/image-studio
 */
import * as React from "react";
import { ImageIcon, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImageGeneration } from "@/lib/image/client";
import type { ImageProviderId, ImageQuality } from "@/lib/ai/image-types";
import { useGenerateImage } from "@/hooks/use-images";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";

import { ModelPicker } from "./model-picker";
import { StylePicker } from "./style-picker";

const SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;
const QUALITIES: ImageQuality[] = ["low", "standard", "high", "hd"];

/** Props accepted by {@link ImageStudio}. */
export interface ImageStudioProps {
  /** Called when a new generation is created (so the parent can switch tabs). */
  onGenerated?: (generation: ImageGeneration) => void;
  className?: string;
}

export function ImageStudio({ onGenerated, className }: ImageStudioProps) {
  const [prompt, setPrompt] = React.useState("");
  const [negativePrompt, setNegativePrompt] = React.useState("");
  const [provider, setProvider] = React.useState<ImageProviderId | null>(null);
  const [model, setModel] = React.useState<string | null>(null);
  const [style, setStyle] = React.useState<string | null>(null);
  const [size, setSize] = React.useState<string>("1024x1024");
  const [quality, setQuality] = React.useState<ImageQuality>("standard");
  const [lastGeneration, setLastGeneration] = React.useState<ImageGeneration | null>(null);

  const generateMutation = useGenerateImage();

  const handleGenerate = async () => {
    if (!provider || !model || !prompt.trim()) return;
    const generation = await generateMutation.mutateAsync({
      provider,
      model,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      style: style ?? undefined,
      size,
      quality,
    });
    setLastGeneration(generation);
    onGenerated?.(generation);
  };

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[1fr_400px]", className)}>
      {/* Left: form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            id="prompt"
            placeholder="A serene mountain lake at sunset, photorealistic, 50mm lens…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            aria-label="Image prompt"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="negativePrompt">Negative prompt (optional)</Label>
          <Textarea
            id="negativePrompt"
            placeholder="blurry, low quality, watermark, text…"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            aria-label="Negative prompt"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Model</Label>
            <ModelPicker
              value={provider && model ? `${provider}:${model}` : null}
              onValueChange={(p, m) => {
                setProvider(p);
                setModel(m);
              }}
              disabled={generateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Style</Label>
            <StylePicker
              value={style}
              onValueChange={setStyle}
              disabled={generateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Size</Label>
            <Select
              value={size}
              onValueChange={setSize}
              disabled={generateMutation.isPending}
            >
              <SelectTrigger className="w-full" aria-label="Image size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SIZES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quality</Label>
            <Select
              value={quality}
              onValueChange={(v) => setQuality(v as ImageQuality)}
              disabled={generateMutation.isPending}
            >
              <SelectTrigger className="w-full" aria-label="Image quality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITIES.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleGenerate}
          disabled={
            generateMutation.isPending ||
            !provider ||
            !model ||
            !prompt.trim()
          }
          className="w-full sm:w-auto"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" />
              Generate
            </>
          )}
        </Button>

        {generateMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {generateMutation.error.message}
          </p>
        ) : null}
      </div>

      {/* Right: result preview */}
      <div className="space-y-3">
        <Label>Result</Label>
        {generateMutation.isPending && !lastGeneration ? (
          <Skeleton className="aspect-square w-full rounded-lg" />
        ) : lastGeneration?.result_url ? (
          <div className="overflow-hidden rounded-lg border">
            <img
              src={lastGeneration.result_url}
              alt={lastGeneration.prompt}
              className="h-auto w-full"
            />
          </div>
        ) : (
          <EmptyState
            icon={ImageIcon}
            title="No image yet"
            description="Write a prompt and click Generate to see your result here."
            className="aspect-square w-full"
          />
        )}
        {lastGeneration?.error ? (
          <p className="text-sm text-destructive">{lastGeneration.error}</p>
        ) : null}
      </div>
    </div>
  );
}
