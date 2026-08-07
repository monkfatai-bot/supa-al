"use client";

/**
 * Supa AI — Transcribe view (STT) (Phase 8).
 *
 * The speech-to-text input form. Lets the caller:
 *   - Pick a provider + model + language from the catalog.
 *   - Upload an audio file (multipart POST to `/api/voice/upload`).
 *   - Submit → calls `/api/voice/transcribe` → displays the resulting
 *     transcript with optional segment timestamps.
 *
 * @module @/components/voice/transcribe-view
 */
import * as React from "react";
import { FileAudio, Loader2, Upload } from "lucide-react";

import type {
  VoiceModel,
} from "@/lib/voice/client";
import { useTranscribe, useUploadAudio, useVoiceModels } from "@/hooks/use-voice";
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
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/types/api";

export function TranscribeView() {
  const modelsQuery = useVoiceModels({ type: "stt" });
  const upload = useUploadAudio();
  const transcribe = useTranscribe();

  const [provider, setProvider] = React.useState<string>("");
  const [modelId, setModelId] = React.useState<string>("");
  const [language, setLanguage] = React.useState<string>("en-US");
  const [speakerLabels, setSpeakerLabels] = React.useState(false);
  const [wordTimestamps, setWordTimestamps] = React.useState(false);
  const [uploadedId, setUploadedId] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const models = (modelsQuery.data ?? []) as VoiceModel[];
  const providers = React.useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models],
  );

  React.useEffect(() => {
    if (!provider && providers.length > 0) setProvider(providers[0]!);
  }, [provider, providers]);

  const providerModels = React.useMemo(
    () => models.filter((m) => m.provider === provider),
    [models, provider],
  );

  React.useEffect(() => {
    if (providerModels.length > 0 && !providerModels.find((m) => m.model_id === modelId)) {
      setModelId(providerModels[0]!.model_id);
    }
  }, [providerModels, modelId]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploadedId(null);
    const result = await upload.mutateAsync(file);
    const uploadId = (result as { upload: { id: string } }).upload.id;
    setUploadedId(uploadId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadedId || !provider || !modelId) return;
    await transcribe.mutateAsync({
      audioUploadId: uploadedId as never,
      provider: provider as never,
      model: modelId || undefined,
      language: language || undefined,
      speakerLabels,
      wordTimestamps,
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
        icon={FileAudio}
        title="No transcription providers configured"
        description="Configure at least one STT provider API key (e.g. OPENAI_API_KEY, DEEPGRAM_API_KEY, ASSEMBLYAI_API_KEY) to start transcribing audio."
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="stt-provider" className="text-xs uppercase tracking-wide text-muted-foreground">
            Provider
          </Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="stt-provider">
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
          <Label htmlFor="stt-model" className="text-xs uppercase tracking-wide text-muted-foreground">
            Model
          </Label>
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger id="stt-model">
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
          <Label htmlFor="stt-language" className="text-xs uppercase tracking-wide text-muted-foreground">
            Language
          </Label>
          <Input
            id="stt-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en-US"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={speakerLabels}
            onChange={(e) => setSpeakerLabels(e.target.checked)}
            className="size-4"
          />
          Speaker labels (diarization)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wordTimestamps}
            onChange={(e) => setWordTimestamps(e.target.checked)}
            className="size-4"
          />
          Word-level timestamps
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="stt-file" className="text-xs uppercase tracking-wide text-muted-foreground">
          Audio file
        </Label>
        <Input
          id="stt-file"
          type="file"
          accept="audio/*"
          onChange={onFileChange}
        />
        {fileName ? (
          <p className="text-[11px] text-muted-foreground">
            {upload.isPending ? "Uploading…" : "Ready: "}{fileName}
          </p>
        ) : null}
        {upload.error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-400">
            Upload failed: {upload.error instanceof Error ? upload.error.message : "unknown"}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!uploadedId || transcribe.isPending}>
          {transcribe.isPending ? (
            <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
          )}
          Transcribe
        </Button>
      </div>

      {transcribe.error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">
          {transcribe.error instanceof Error ? transcribe.error.message : "Transcription failed."}
        </p>
      ) : null}

      {transcribe.data ? (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="text-xs font-medium">Transcript</p>
          <Textarea
            readOnly
            rows={6}
            value={(transcribe.data as { transcript: { text: string } }).transcript.text}
            className="resize-y bg-background"
          />
          <p className="text-[11px] text-muted-foreground">
            Generation id:{" "}
            <code className="font-mono">
              {(transcribe.data as { generation: { id: string } }).generation.id}
            </code>
          </p>
        </div>
      ) : null}
    </form>
  );
}
