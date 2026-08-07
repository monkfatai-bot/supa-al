"use client";

/**
 * Supa AI — Voice studio (TTS) (Phase 8).
 *
 * The text-to-speech input form. Lets the caller:
 *   - Pick a provider + model + voice + language from the catalog.
 *   - Enter the text to synthesize (validated client-side up to 12K chars).
 *   - Adjust speed / stability when the provider supports them.
 *   - Submit → calls `/api/voice/synthesize` → plays the resulting audio
 *     inline via an `<audio>` element.
 *
 * Errors from the API are surfaced inline. Successful results render a
 * small "result" panel with the audio + the persisted generation id.
 *
 * @module @/components/voice/voice-studio
 */
import * as React from "react";
import { Loader2, Play, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  VoiceModel,
} from "@/lib/voice/client";
import { useVoiceModels } from "@/hooks/use-voice";
import { useSynthesize } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/types/api";

interface VoiceCatalogVoice {
  id: string;
  label: string;
  language?: string;
  gender?: string;
}

const MAX_TEXT_LENGTH = 12_000;

export function VoiceStudio() {
  const modelsQuery = useVoiceModels({ type: "tts" });
  const synthesize = useSynthesize();

  const [text, setText] = React.useState("");
  const [provider, setProvider] = React.useState<string>("");
  const [modelId, setModelId] = React.useState<string>("");
  const [voiceId, setVoiceId] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("en-US");
  const [speed, setSpeed] = React.useState(1);

  // Group models by provider for the dropdown.
  const models = (modelsQuery.data ?? []) as VoiceModel[];
  const providers = React.useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models],
  );

  // When providers first arrive, pick the first one.
  React.useEffect(() => {
    if (!provider && providers.length > 0) {
      setProvider(providers[0]!);
    }
  }, [provider, providers]);

  // Filter the model list to the selected provider, then auto-pick the
  // first one when the provider changes.
  const providerModels = React.useMemo(
    () => models.filter((m) => m.provider === provider),
    [models, provider],
  );

  React.useEffect(() => {
    if (providerModels.length > 0 && !providerModels.find((m) => m.model_id === modelId)) {
      setModelId(providerModels[0]!.model_id);
    }
  }, [providerModels, modelId]);

  const selectedModel = providerModels.find((m) => m.model_id === modelId) ?? null;
  const supportedVoices = React.useMemo<VoiceCatalogVoice[]>(() => {
    const raw = selectedModel?.supported_voices;
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return (raw as unknown as VoiceCatalogVoice[]).filter((v) => v && typeof v.id === "string");
    }
    return [];
  }, [selectedModel]);

  React.useEffect(() => {
    if (supportedVoices.length > 0 && !supportedVoices.find((v) => v.id === voiceId)) {
      setVoiceId(supportedVoices[0]!.id);
    }
  }, [supportedVoices, voiceId]);

  const canSubmit = !!text.trim() && !!provider && !!modelId && !!voiceId && !synthesize.isPending;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await synthesize.mutateAsync({
      text,
      provider: provider as never,
      model: modelId || undefined,
      voiceId,
      language: language || undefined,
      settings: { speed },
    });
  }

  if (modelsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-9 w-40" />
      </div>
    );
  }

  if (modelsQuery.isError || models.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No voice models configured"
        description="Configure at least one voice provider API key (e.g. OPENAI_API_KEY, ELEVENLABS_API_KEY) to start synthesizing speech."
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="voice-provider" className="text-xs uppercase tracking-wide text-muted-foreground">
            Provider
          </Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="voice-provider">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="uppercase">{p}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="voice-model" className="text-xs uppercase tracking-wide text-muted-foreground">
            Model
          </Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger id="voice-model">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {providerModels.map((m) => (
                <SelectItem key={m.id} value={m.model_id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="voice-id" className="text-xs uppercase tracking-wide text-muted-foreground">
            Voice
          </Label>
          <Select value={voiceId} onValueChange={setVoiceId}>
            <SelectTrigger id="voice-id">
              <SelectValue placeholder="Voice" />
            </SelectTrigger>
            <SelectContent>
              {supportedVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="voice-language" className="text-xs uppercase tracking-wide text-muted-foreground">
            Language
          </Label>
          <Input
            id="voice-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en-US"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="voice-speed" className="text-xs uppercase tracking-wide text-muted-foreground">
            Speed: {speed.toFixed(2)}×
          </Label>
          <Slider
            id="voice-speed"
            value={[speed]}
            min={0.5}
            max={2}
            step={0.05}
            onValueChange={(values) => setSpeed(values[0] ?? 1)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="voice-text" className="text-xs uppercase tracking-wide text-muted-foreground">
          Text to synthesize
        </Label>
        <Textarea
          id="voice-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
          placeholder="Type or paste the text you want to convert to speech…"
          rows={6}
          className="resize-y"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{text.length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} chars</span>
          {synthesize.error ? (
            <span className="text-rose-600 dark:text-rose-400">
              {synthesize.error instanceof Error ? synthesize.error.message : "Synthesis failed."}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!canSubmit}>
          {synthesize.isPending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="mr-1.5 size-4" aria-hidden="true" />
          )}
          Synthesize
        </Button>
      </div>

      {synthesize.data ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium">Result</p>
          <audio
            controls
            src={(synthesize.data as { audioUrl: string }).audioUrl}
            className="w-full"
          />
          <p className="text-[11px] text-muted-foreground">
            Generation id:{" "}
            <code className="font-mono">
              {(synthesize.data as { generation: { id: string } }).generation.id}
            </code>
          </p>
        </div>
      ) : null}
    </form>
  );
}
