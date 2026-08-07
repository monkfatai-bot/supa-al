"use client";

/**
 * Supa AI — Voice view (Phase 8).
 *
 * The top-level voice surface. A tabbed container with five sections:
 *   - Synthesize  — TTS studio.
 *   - Transcribe  — STT input.
 *   - Library     — past generations.
 *   - Profiles    — saved + cloned voice profiles.
 *   - Usage       — usage summary card.
 *
 * @module @/components/voice/voice-view
 */
import * as React from "react";
import {
  AudioLines,
  BarChart3,
  FileAudio,
  Library,
  Mic,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { VoiceStudio } from "./voice-studio";
import { TranscribeView } from "./transcribe-view";
import { VoiceLibrary } from "./voice-library";
import { VoiceCloneManager } from "./voice-clone-manager";
import { VoiceUsageCard } from "./voice-usage-card";

type VoiceTab = "synthesize" | "transcribe" | "library" | "profiles" | "usage";

const TABS: { id: VoiceTab; label: string; icon: typeof Mic }[] = [
  { id: "synthesize", label: "Synthesize", icon: Mic },
  { id: "transcribe", label: "Transcribe", icon: AudioLines },
  { id: "library", label: "Library", icon: Library },
  { id: "profiles", label: "Profiles", icon: Users },
  { id: "usage", label: "Usage", icon: BarChart3 },
];

export function VoiceView() {
  const [tab, setTab] = React.useState<VoiceTab>("synthesize");
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileAudio className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Voice & Audio
            </h1>
            <p className="text-xs text-muted-foreground">
              Text-to-speech, speech-to-text, translation, dubbing, and voice cloning.
            </p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as VoiceTab)}>
          <TabsList className="mx-4 mb-2">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                <t.icon className="mr-1.5 size-3.5" aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="synthesize" className={cn(PAD)}>
            <VoiceStudio />
          </TabsContent>
          <TabsContent value="transcribe" className={cn(PAD)}>
            <TranscribeView />
          </TabsContent>
          <TabsContent value="library" className={cn(PAD)}>
            <VoiceLibrary />
          </TabsContent>
          <TabsContent value="profiles" className={cn(PAD)}>
            <VoiceCloneManager />
          </TabsContent>
          <TabsContent value="usage" className={cn(PAD)}>
            <VoiceUsageCard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const PAD = "p-4 sm:p-6 lg:p-8";
