"use client";

import type { ImageSize, ImageQuality, ImageStylePreset, AspectRatio } from "@/services/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface ImageSettingsProps {
  size: ImageSize;
  quality: ImageQuality;
  style: ImageStylePreset;
  aspectRatio: AspectRatio;
  numImages: number;
  modelId: string;
  onSizeChange: (size: ImageSize) => void;
  onQualityChange: (quality: ImageQuality) => void;
  onStyleChange: (style: ImageStylePreset) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onNumImagesChange: (n: number) => void;
  disabled?: boolean;
}

const SIZE_LABELS: Record<string, string> = {
  "512x512": "512 x 512",
  "768x768": "768 x 768",
  "1024x1024": "1024 x 1024 (Square)",
  "1536x1024": "1536 x 1024 (Landscape)",
  "1024x1536": "1024 x 1536 (Portrait)",
  "1792x1024": "1792 x 1024 (Wide)",
  "1024x1792": "1024 x 1792 (Tall)",
  "2048x2048": "2048 x 2048 (Ultra HD)",
};

const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "1:1": "1:1 Square",
  "4:3": "4:3 Landscape",
  "3:4": "3:4 Portrait",
  "16:9": "16:9 Widescreen",
  "9:16": "9:16 Vertical",
  "3:2": "3:2 Photo",
  "2:3": "2:3 Tall Photo",
};

const STYLE_OPTIONS = [
  { value: "vivid", label: "Vivid" },
  { value: "natural", label: "Natural" },
  { value: "anime", label: "Anime" },
  { value: "photographic", label: "Photographic" },
  { value: "digital-art", label: "Digital Art" },
  { value: "fantasy-art", label: "Fantasy Art" },
  { value: "cinematic", label: "Cinematic" },
  { value: "3d-model", label: "3D Render" },
  { value: "neon-punk", label: "Neon Punk" },
  { value: "enhance", label: "Enhance" },
];

export function ImageSettings({
  size,
  quality,
  style,
  aspectRatio,
  numImages,
  modelId: _modelId,
  onSizeChange,
  onQualityChange,
  onStyleChange,
  onAspectRatioChange,
  onNumImagesChange,
  disabled = false,
}: ImageSettingsProps) {
  // In a real implementation, you'd fetch model info to determine supported sizes
  // For now, offer all sizes
  const allSizes = Object.keys(SIZE_LABELS) as ImageSize[];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Size</Label>
          <Select value={size} onValueChange={(v) => onSizeChange(v as ImageSize)} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allSizes.map((s) => (
                <SelectItem key={s} value={s}>
                  {SIZE_LABELS[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Aspect Ratio</Label>
          <Select value={aspectRatio} onValueChange={(v) => onAspectRatioChange(v as AspectRatio)} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ASPECT_RATIO_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Quality</Label>
          <Select value={quality} onValueChange={(v) => onQualityChange(v as ImageQuality)} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="hd">HD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Style</Label>
          <Select value={style} onValueChange={(v) => onStyleChange(v as ImageStylePreset)} disabled={disabled}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">Number of Images: {numImages}</Label>
          <Slider
            value={[numImages]}
            onValueChange={([v]) => onNumImagesChange(v)}
            min={1}
            max={4}
            step={1}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
