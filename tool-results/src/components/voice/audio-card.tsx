"use client";

/**
 * Supa AI — Voice audio card (Phase 8).
 *
 * Compact presentational card for a single voice generation. Shows:
 *   - Type + provider badges.
 *   - Status indicator (pending / processing / completed / failed / cancelled).
 *   - For TTS / dub: an inline audio player.
 *   - For STT / translate: a snippet of the transcript text.
 *   - The original text (TTS) or source language (STT) when present.
 *   - A copy / download action when an `audioUrl` is available.
 *
 * @module @/components/voice/audio-card
 */
import * as React from "react";
import { Copy, Download, FileAudio, Languages, Mic, Play, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { VoiceGeneration } from "@/lib/voice/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";

const STATUS_DOT_STYLES: Record<VoiceGeneration["status"], string> = {
  pending: "bg-amber-500",
  processing: "bg-sky-500 animate-pulse",
  completed: "bg-emerald-500",
  failed: "bg-rose-500",
  cancelled: "bg-muted-foreground/40",
};

const STATUS_LABELS: Record<VoiceGeneration["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TYPE_LABELS: Record<VoiceGeneration["type"], string> = {
  tts: "Speech",
  stt: "Transcription",
  translate: "Translation",
  dub: "Dub",
  clone: "Clone",
};

export interface AudioCardProps {
  generation: VoiceGeneration;
  /** Transcript text (when present — STT / translate results). */
  transcriptText?: string | null;
  onDelete?: (generation: VoiceGeneration) => void;
  className?: string;
}

export function AudioCard({
  generation,
  transcriptText,
  onDelete,
  className,
}: AudioCardProps) {
  const audioUrl = generation.result_url ?? null;
  const text = generation.text ?? transcriptText ?? null;
  const hasAudio = generation.type === "tts" || generation.type === "dub";
  const hasText = (generation.type === "stt" || generation.type === "translate") && !!text;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <TypeIcon type={generation.type} />
          </span>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] font-medium">
                {TYPE_LABELS[generation.type]}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-medium uppercase">
                {generation.provider}
              </Badge>
              {generation.language ? (
                <Badge variant="outline" className="text-[10px] font-medium uppercase">
                  {generation.language}
                </Badge>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {new Date(generation.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            aria-label={`Status: ${STATUS_LABELS[generation.status]}`}
            className={cn(
              "size-2 rounded-full",
              STATUS_DOT_STYLES[generation.status],
            )}
          />
          {STATUS_LABELS[generation.status]}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {generation.error ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Error: {generation.error}
          </p>
        ) : null}

        {hasAudio && audioUrl ? (
          <audio
            controls
            src={audioUrl}
            className="w-full"
            preload="metadata"
          />
        ) : null}

        {hasAudio && !audioUrl && generation.status === "completed" ? (
          <p className="text-xs text-muted-foreground italic">
            Audio no longer available (URL expired).
          </p>
        ) : null}

        {hasText && text ? (
          <p className="line-clamp-4 whitespace-pre-wrap text-xs text-foreground text-pretty">
            {text}
          </p>
        ) : null}

        {generation.type === "tts" && generation.text ? (
          <p className="line-clamp-3 text-xs text-muted-foreground text-pretty">
            “{generation.text}”
          </p>
        ) : null}

        {generation.type === "clone" && generation.voice_id ? (
          <div className="rounded-md border border-dashed bg-muted/40 p-2 text-xs">
            <span className="text-muted-foreground">Cloned voice id:</span>{" "}
            <code className="break-all font-mono">{generation.voice_id}</code>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex items-center justify-end gap-1 border-t bg-muted/30 px-4 py-2">
        {audioUrl ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={audioUrl} download={`voice-${generation.id}.mp3`}>
                <Download className="mr-1 size-3.5" aria-hidden="true" />
                Download
              </a>
            </Button>
            <CopyButton text={audioUrl} />
          </>
        ) : null}
        {onDelete ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(generation)}
          >
            <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function TypeIcon({ type }: { type: VoiceGeneration["type"] }) {
  switch (type) {
    case "tts":
      return <Play className="size-4" aria-hidden="true" />;
    case "stt":
      return <FileAudio className="size-4" aria-hidden="true" />;
    case "translate":
      return <Languages className="size-4" aria-hidden="true" />;
    case "dub":
      return <Mic className="size-4" aria-hidden="true" />;
    case "clone":
      return <Copy className="size-4" aria-hidden="true" />;
    default:
      return <FileAudio className="size-4" aria-hidden="true" />;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore — clipboard may be blocked
        }
      }}
    >
      <Copy className="mr-1 size-3.5" aria-hidden="true" />
      {copied ? "Copied!" : "Copy"}
    </Button>
  );
}
