"use client";

/**
 * Supa AI — Voice library (Phase 8).
 *
 * The "past generations" surface — a paginated grid of audio cards
 * sourced from `/api/voice/history`. Filters by type + provider + status.
 *
 * @module @/components/voice/voice-library
 */
import * as React from "react";
import { Mic, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  VoiceGeneration,
  VoiceGenerationStatus,
  VoiceGenerationType,
} from "@/lib/voice/client";
import { useVoiceHistory } from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { AudioCard } from "./audio-card";

const PROVIDER_OPTIONS = [
  "openai",
  "elevenlabs",
  "google",
  "azure",
  "deepgram",
  "assemblyai",
  "cartesia",
  "playht",
] as const;

const TYPE_OPTIONS: VoiceGenerationType[] = ["tts", "stt", "translate", "dub", "clone"];
const STATUS_OPTIONS: VoiceGenerationStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
];

export function VoiceLibrary() {
  const [type, setType] = React.useState<VoiceGenerationType | "">("");
  const [provider, setProvider] = React.useState<string>("");
  const [status, setStatus] = React.useState<VoiceGenerationStatus | "">("");

  const history = useVoiceHistory({
    type: type || undefined,
    provider: (provider || undefined) as never,
    status: status || undefined,
    limit: 30,
  });

  const generations = (history.data ?? []) as VoiceGeneration[];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Filter by provider, voice, or text…"
            className="pl-9"
            aria-label="Filter voice generations"
            disabled
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={type || "all"}
            onValueChange={(v) => setType(v === "all" ? "" : (v as VoiceGenerationType))}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPE_OPTIONS.map((t) => (
                <SelectItem key={t} value={t}>
                  <span className="uppercase">{t}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={provider || "all"}
            onValueChange={(v) => setProvider(v === "all" ? "" : v)}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by provider">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="capitalize">{p}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || "all"}
            onValueChange={(v) => setStatus(v === "all" ? "" : (v as VoiceGenerationStatus))}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="capitalize">{s}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {history.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : history.isError ? (
        <EmptyState
          icon={Mic}
          title="Couldn't load voice history"
          description={
            history.error instanceof Error
              ? history.error.message
              : "Please try again."
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => history.refetch()}>
              Retry
            </Button>
          }
        />
      ) : generations.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No voice generations yet"
          description="Generate your first piece of audio from the Synthesize tab, or transcribe an audio file from the Transcribe tab."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {generations.map((g) => (
            <AudioCard key={g.id} generation={g} />
          ))}
        </div>
      )}
    </div>
  );
}
