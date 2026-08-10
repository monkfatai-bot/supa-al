"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Volume2 } from "lucide-react";
import { getEnabledVoiceModels } from "@/services/voice/models";

const VOICE_OPTIONS = [
  { id: "alloy", name: "Alloy", provider: "openai" },
  { id: "echo", name: "Echo", provider: "openai" },
  { id: "fable", name: "Fable", provider: "openai" },
  { id: "nova", name: "Nova", provider: "openai" },
  { id: "shimmer", name: "Shimmer", provider: "openai" },
  { id: "rachel", name: "Rachel", provider: "elevenlabs" },
  { id: "drew", name: "Drew", provider: "elevenlabs" },
  { id: "bella", name: "Bella", provider: "elevenlabs" },
] as const;

const OUTPUT_FORMATS = [
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "ogg", label: "OGG" },
] as const;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
  { value: "yo", label: "Yoruba" },
  { value: "ha", label: "Hausa" },
  { value: "ig", label: "Igbo" },
] as const;

interface VoiceGeneratorProps {
  onGenerate: (input: {
    prompt: string;
    modelId?: string;
    voiceId?: string;
    settings?: Record<string, unknown>;
  }) => Promise<{ success: boolean; message: string }>;
}

export function VoiceGenerator({ onGenerate }: VoiceGeneratorProps) {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState("");
  const [voiceId, setVoiceId] = useState("alloy");
  const [speed, setSpeed] = useState(1.0);
  const [outputFormat, setOutputFormat] = useState("mp3");
  const [language, setLanguage] = useState("en");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ttsModels = useMemo(
    () => getEnabledVoiceModels().filter((m) => m.supportsTts),
    []
  );

  const selectedModel = ttsModels.find((m) => m.id === modelId) ?? ttsModels[0];

  if (!selectedModel) {
    return (
      <div className="border-b p-4">
        <p className="text-sm text-muted-foreground">No TTS models available.</p>
      </div>
    );
  }

  async function handleGenerate() {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    const result = await onGenerate({
      prompt: trimmed,
      modelId: modelId || undefined,
      voiceId,
      settings: { speed, outputFormat, language },
    });

    if (!result.success) {
      setError(result.message);
    }

    setIsGenerating(false);
  }

  return (
    <div className="border-b p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Generate Speech</h2>
        <Select
          value={modelId || selectedModel.id}
          onValueChange={setModelId}
          disabled={isGenerating}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {ttsModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name} ({m.creditCost} cr)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative">
        <Textarea
          placeholder="Enter the text you want to convert to speech..."
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 5000))}
          rows={4}
          disabled={isGenerating}
          className="resize-none pr-16"
        />
        <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
          {text.length}/5000
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Voice</Label>
          <Select value={voiceId} onValueChange={setVoiceId} disabled={isGenerating}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VOICE_OPTIONS.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name} <span className="text-muted-foreground">({v.provider})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Speed: {speed.toFixed(1)}x</Label>
          <Slider
            value={[speed]}
            onValueChange={([v]) => setSpeed(v)}
            min={0.5}
            max={2.0}
            step={0.1}
            disabled={isGenerating}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Format</Label>
          <Select value={outputFormat} onValueChange={setOutputFormat} disabled={isGenerating}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Language</Label>
          <Select value={language} onValueChange={setLanguage} disabled={isGenerating}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={!text.trim() || isGenerating}
          className="min-w-40"
        >
          {isGenerating ? (
            <><span className="animate-spin mr-2">&#9696;</span>Generating...</>
          ) : (
            <><Volume2 className="mr-2 h-4 w-4" />Generate ({selectedModel.creditCost} credits)</>
          )}
        </Button>
        <span className="text-xs text-muted-foreground">
          Model: {selectedModel.name} | Max {selectedModel.characterLimit} chars
        </span>
      </div>

      {error && !isGenerating && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
