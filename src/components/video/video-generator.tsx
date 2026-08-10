"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Sparkles, Upload } from "lucide-react";
import { getEnabledVideoModels, getDefaultVideoModel } from "@/services/video/models";
import { DEFAULT_VIDEO_SETTINGS } from "@/services/video/types";
import { uploadSourceFile } from "@/services/video/actions";
import type {
  VideoAspectRatio,
  CameraMovement,
} from "@/services/video/types";

interface VideoGeneratorProps {
  onGenerate: (input: {
    prompt: string;
    negativePrompt?: string;
    modelId?: string;
    settings?: Record<string, unknown>;
    sourceImageStoragePath?: string;
  }) => Promise<{ success: boolean; message: string }>;
}

export function VideoGenerator({ onGenerate }: VideoGeneratorProps) {
  const models = getEnabledVideoModels();
  const defaultModel = getDefaultVideoModel();

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [modelId, setModelId] = useState(defaultModel.id);
  const [aspectRatio, setAspectRatio] = useState<VideoAspectRatio>(DEFAULT_VIDEO_SETTINGS.aspectRatio);
  const [duration, setDuration] = useState(DEFAULT_VIDEO_SETTINGS.durationSeconds);
  const [fps, setFps] = useState(DEFAULT_VIDEO_SETTINGS.fps);
  const [motionStrength, setMotionStrength] = useState(5);
  const [cameraMovement, setCameraMovement] = useState<CameraMovement>("none");
  const [creativity, setCreativity] = useState(5);
  const [seed, setSeed] = useState<string>("");
  const [sourceImagePath] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = models.find((m) => m.id === modelId) ?? defaultModel;

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", "image");

    const result = await uploadSourceFile(formData);
    if (result.success) {
      setError(null);
    } else {
      setError(result.message);
    }
  }, []);

  const maxDuration = selectedModel.maxDurationSeconds;

  async function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    const result = await onGenerate({
      prompt: trimmed,
      negativePrompt: negativePrompt.trim() || undefined,
      modelId,
      settings: {
        aspectRatio,
        durationSeconds: Math.min(duration, maxDuration),
        fps: Math.min(fps, selectedModel.maxFps),
        motionStrength,
        cameraMovement: cameraMovement !== "none" ? cameraMovement : undefined,
        creativity,
        seed: seed ? parseInt(seed, 10) : undefined,
      },
      sourceImageStoragePath: sourceImagePath || undefined,
    });

    if (!result.success) {
      setError(result.message);
    }

    setIsGenerating(false);
  }

  return (
    <div className="border-b p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Create Video</h2>
        <Select value={modelId} onValueChange={setModelId} disabled={isGenerating}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} ({m.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        placeholder="Describe the video you want to create..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        disabled={isGenerating}
        className="resize-none"
      />

      {/* Settings row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Aspect Ratio</Label>
          <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as VideoAspectRatio)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">16:9 Landscape</SelectItem>
              <SelectItem value="9:16">9:16 Portrait</SelectItem>
              <SelectItem value="1:1">1:1 Square</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Duration: {duration}s</Label>
          <Slider
            value={[duration]}
            onValueChange={([v]) => setDuration(v)}
            min={2}
            max={selectedModel.maxDurationSeconds}
            step={1}
            disabled={isGenerating}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">FPS: {fps}</Label>
          <Select value={String(fps)} onValueChange={(v) => setFps(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24">24 fps</SelectItem>
              <SelectItem value="30">30 fps</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Camera</Label>
          <Select value={cameraMovement} onValueChange={(v) => setCameraMovement(v as CameraMovement)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="zoom-in">Zoom In</SelectItem>
              <SelectItem value="zoom-out">Zoom Out</SelectItem>
              <SelectItem value="pan-left">Pan Left</SelectItem>
              <SelectItem value="pan-right">Pan Right</SelectItem>
              <SelectItem value="orbit-left">Orbit Left</SelectItem>
              <SelectItem value="orbit-right">Orbit Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced settings */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Motion: {motionStrength}</Label>
          <Slider
            value={[motionStrength]}
            onValueChange={([v]) => setMotionStrength(v)}
            min={1}
            max={10}
            step={1}
            disabled={isGenerating || !selectedModel.supportsMotionStrength}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Creativity: {creativity}</Label>
          <Slider
            value={[creativity]}
            onValueChange={([v]) => setCreativity(v)}
            min={1}
            max={10}
            step={1}
            disabled={isGenerating}
          />
        </div>

        {selectedModel.supportsSeed && (
          <div className="space-y-1.5">
            <Label className="text-xs">Seed (optional)</Label>
            <Input
              type="number"
              placeholder="Random"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={isGenerating}
            />
          </div>
        )}

        {selectedModel.supportsNegativePrompt && (
          <div className="space-y-1.5">
            <Label className="text-xs">Negative Prompt</Label>
            <Input
              placeholder="What to avoid..."
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              disabled={isGenerating}
            />
          </div>
        )}
      </div>

      {/* Image-to-video upload */}
      {selectedModel.supportsImageInput && (
        <div className="flex items-center gap-3">
          <Label className="text-xs whitespace-nowrap">Source Image</Label>
          <label className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" />
            Upload Image
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isGenerating}
            />
          </label>
          {sourceImagePath && <span className="text-xs text-muted-foreground">Image uploaded</span>}
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="min-w-32"
        >
          {isGenerating ? (
            <><span className="animate-spin mr-2">&#9696;</span>Starting...</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" />Generate ({selectedModel.creditCost} credits)</>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          Model: {selectedModel.name} | Max {selectedModel.maxDurationSeconds}s
        </span>
      </div>

      {error && !isGenerating && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
