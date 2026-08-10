"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Copy, Check, FileAudio } from "lucide-react";
import type { VoiceTranscript } from "@/types/generated/database";

interface TranscriptViewerProps {
  transcript: VoiceTranscript | null;
  transcriptText?: string;
  confidence?: number;
  language?: string;
}

export function TranscriptViewer({ transcript, transcriptText, confidence, language }: TranscriptViewerProps) {
  const [copied, setCopied] = useState(false);

  const text = transcript?.transcript_text ?? transcriptText ?? "";
  const conf = transcript?.confidence ?? confidence;
  const lang = transcript?.language ?? language;
  const wordCount = transcript?.word_count ?? text.split(/\s+/).filter(Boolean).length;
  const speakerLabels = transcript?.speaker_labels as Array<{ speaker: string; start: number; end: number }> | null;

  if (!text) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileAudio className="h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No transcript available</p>
      </div>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function renderSpeakerSegments(): React.ReactNode {
    if (!speakerLabels || speakerLabels.length === 0) return null;

    return (
      <div className="space-y-3 mt-3">
        <Separator />
        <h4 className="text-sm font-medium">Speaker Diarization</h4>
        <div className="space-y-2">
          {speakerLabels.map((seg, i) => (
            <div key={i} className="flex gap-2">
              <Badge variant="outline" className="shrink-0 text-xs">
                {seg.speaker}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Transcript</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? (
              <><Check className="mr-2 h-4 w-4" />Copied</>
            ) : (
              <><Copy className="mr-2 h-4 w-4" />Copy</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{wordCount} words</span>
          {lang && <Badge variant="secondary" className="text-xs">{lang}</Badge>}
          {conf !== null && conf !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(conf * 100)}% confidence
            </Badge>
          )}
        </div>

        <div className="rounded-md bg-muted p-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>

        {renderSpeakerSegments()}
      </CardContent>
    </Card>
  );
}
