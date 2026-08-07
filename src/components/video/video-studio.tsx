"use client";

/**
 * Supa AI — Video studio (Phase 5).
 *
 * The "compose a new generation" surface. Renders a prompt textarea,
 * model picker (sourced from `/api/video/models`), duration selector,
 * and resolution/aspect-ratio pickers. On submit, calls
 * `POST /api/video/generate` and notifies the gallery via the
 * `onGenerated` callback.
 *
 * Image-to-video: when `sourceImage` is provided, the request `type`
 * switches to `image-to-video`. Video-to-video is analogous.
 *
 * @module @/components/video/video-studio
 */
import * as React from "react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VideoProviderId } from "@/lib/video/client";
import { useGenerateVideo, useVideoModels } from "@/hooks/use-videos";
import type { CatalogVideoModel } from "@/hooks/use-videos";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const DURATIONS = [3, 5, 8, 10, 12] as const;
const RESOLUTIONS = ["720p", "1080p", "4k"] as const;
const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

export interface VideoStudioProps {
  /** Optional source image URL — when set, switches the request to image-to-video. */
  sourceImageUrl?: string | null;
  /** Called when a generation is successfully enqueued. */
  onGenerated?: () => void;
  className?: string;
}

interface ModelOption {
  provider: VideoProviderId;
  modelId: string;
  label: string;
}

function flatten(groups: { provider: string; models: CatalogVideoModel[] }[]): ModelOption[] {
  const out: ModelOption[] = [];
  for (const g of groups) {
    for (const m of g.models) {
      if (!m.isActive) continue;
      out.push({
        provider: g.provider as VideoProviderId,
        modelId: m.modelId,
        label: `${m.name} — ${g.provider}`,
      });
    }
  }
  return out;
}

export function VideoStudio({
  sourceImageUrl,
  onGenerated,
  className,
}: VideoStudioProps) {
  const models = useVideoModels();
  const generate = useGenerateVideo();
  const { toast } = useToast();

  const flatModels = React.useMemo(
    () => flatten(models.data?.groups ?? []),
    [models.data?.groups],
  );

  const [prompt, setPrompt] = React.useState("");
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [duration, setDuration] = React.useState<number>(5);
  const [resolution, setResolution] = React.useState<string>("1080p");
  const [aspectRatio, setAspectRatio] = React.useState<string>("16:9");

  // Pick the first model as the default when the catalog resolves.
  React.useEffect(() => {
    if (selectedModel || flatModels.length === 0) return;
    const first = flatModels[0]!;
    setSelectedModel(`${first.provider}::${first.modelId}`);
  }, [selectedModel, flatModels]);

  const selected = React.useMemo(() => {
    if (!selectedModel) return null;
    const [provider, ...rest] = selectedModel.split("::");
    return { provider: provider as VideoProviderId, modelId: rest.join("::") };
  }, [selectedModel]);

  const handleSubmit = React.useCallback(async () => {
    if (!selected) {
      toast({ title: "Please select a model.", variant: "destructive" });
      return;
    }
    if (!prompt.trim()) {
      toast({ title: "Prompt must not be empty.", variant: "destructive" });
      return;
    }
    try {
      await generate.mutateAsync({
        provider: selected.provider,
        model: selected.modelId,
        prompt: prompt.trim(),
        type: sourceImageUrl ? "image-to-video" : "text-to-video",
        sourceImageUrl: sourceImageUrl ?? undefined,
        duration,
        resolution,
        aspectRatio,
      });
      toast({ title: "Generation enqueued." });
      setPrompt("");
      onGenerated?.();
    } catch (err) {
      toast({
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [selected, prompt, sourceImageUrl, duration, resolution, aspectRatio, generate, toast, onGenerated]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor="video-prompt">Prompt</Label>
        <Textarea
          id="video-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A cinematic shot of a hot-air balloon drifting over the Sahara at dawn…"
          rows={5}
          maxLength={8000}
        />
        <p className="text-xs text-muted-foreground">
          {prompt.length}/8000
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="video-model">Model</Label>
          {models.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id="video-model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {flatModels.map((m) => (
                  <SelectItem
                    key={`${m.provider}::${m.modelId}`}
                    value={`${m.provider}::${m.modelId}`}
                  >
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-duration">Duration</Label>
          <Select
            value={String(duration)}
            onValueChange={(v) => setDuration(Number(v))}
          >
            <SelectTrigger id="video-duration">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-resolution">Resolution</Label>
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger id="video-resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-aspect">Aspect ratio</Label>
          <Select value={aspectRatio} onValueChange={setAspectRatio}>
            <SelectTrigger id="video-aspect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={generate.isPending || !selected}
        className="w-full sm:w-auto"
      >
        {generate.isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Enqueuing…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 size-4" />
            Generate video
          </>
        )}
      </Button>

      {sourceImageUrl && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Wand2 className="size-3.5" aria-hidden />
          Image-to-video mode — using the provided source image.
        </p>
      )}
    </div>
  );
}
