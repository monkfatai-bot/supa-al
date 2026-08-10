"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { VoiceGenerator } from "./voice-generator";
import { AudioRecorder } from "./audio-recorder";
import { AudioUpload } from "./audio-upload";
import { AudioPlayer } from "./audio-player";
import { TranscriptViewer } from "./transcript-viewer";
import { VoiceCloneManager } from "./voice-clone-manager";
import { VoiceLibrary } from "./voice-library";
import { VoiceLoadingState } from "./voice-loading-state";
import { VoiceErrorState } from "./voice-error-state";
import { Heart, Copy, Trash2, Download, Music } from "lucide-react";
import {
  generateSpeech,
  transcribeAudio,
  deleteVoice,
  toggleFavoriteVoice,
  duplicateVoice,
  cancelJob,
  getActiveJobs,
  getSignedAudioUrl,
  getSignedAudioUrlsForPaths,
} from "@/services/voice/actions";
import type { VoiceHistoryItem } from "@/services/voice/actions";
import type { VoiceJob } from "@/types/generated/database";

interface VoiceStudioProps {
  initialHistory: VoiceHistoryItem[];
}

export function VoiceStudio({ initialHistory }: VoiceStudioProps) {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<VoiceHistoryItem[]>(initialHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<VoiceJob[]>([]);
  const [audioUrls, setAudioUrls] = useState<Map<string, string>>(new Map());
  const [uploadedAudioPath, setUploadedAudioPath] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedItem = historyItems.find((h) => h.generation.id === selectedId) ?? null;

  const resolvedAudioUrl = selectedItem?.generation.output_audio_path
    ? audioUrls.get(selectedItem.generation.output_audio_path) ?? null
    : null;

  // Fetch signed URLs for completed items on mount
  useEffect(() => {
    async function fetchUrls() {
      const paths = initialHistory
        .filter((h) => h.generation.status === "completed" && h.generation.output_audio_path)
        .map((h) => h.generation.output_audio_path!);

      if (paths.length > 0) {
        const urls = await getSignedAudioUrlsForPaths(paths);
        setAudioUrls(urls);
      }
    }
    fetchUrls();
  }, [initialHistory]);

  // Poll active jobs every 5 seconds
  useEffect(() => {
    async function poll() {
      const jobs = await getActiveJobs();
      setActiveJobs(jobs);
      if (jobs.length > 0) {
        router.refresh();
      }
    }

    poll();
    pollIntervalRef.current = setInterval(poll, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [router]);

  // Fetch URL for a specific storage path on cache miss
  useEffect(() => {
    async function fetchUrl() {
      if (
        selectedItem?.generation.status === "completed" &&
        selectedItem.generation.output_audio_path &&
        !audioUrls.has(selectedItem.generation.output_audio_path)
      ) {
        const url = await getSignedAudioUrl(selectedItem.generation.output_audio_path);
        if (url) {
          setAudioUrls((prev) => {
            const next = new Map(prev);
            next.set(selectedItem.generation.output_audio_path!, url);
            return next;
          });
        }
      }
    }
    fetchUrl();
  }, [selectedItem, audioUrls]);

  async function handleGenerate(input: {
    prompt: string;
    modelId?: string;
    voiceId?: string;
    settings?: Record<string, unknown>;
  }) {
    const settings = input.settings ?? {};
    const result = await generateSpeech({
      text: input.prompt,
      modelId: input.modelId,
      voiceId: input.voiceId,
      language: settings.language as string | undefined,
      speed: settings.speed as number | undefined,
      outputFormat: settings.outputFormat as string | undefined,
    });

    if (result.success && result.generation) {
      const newItem: VoiceHistoryItem = {
        generation: result.generation,
        job: result.job ?? null,
      };
      setHistoryItems((prev) => [newItem, ...prev]);
      setSelectedId(result.generation.id);
      if (result.job) {
        setActiveJobs((prev) => [...prev, result.job!]);
      }
      router.refresh();
    }

    return { success: result.success, message: result.message };
  }

  async function handleDelete(id: string) {
    const result = await deleteVoice(id);
    if (result.success) {
      setHistoryItems((prev) => prev.filter((h) => h.generation.id !== id));
      if (selectedId === id) setSelectedId(null);
      router.refresh();
    }
    return { success: result.success, message: result.message };
  }

  async function handleToggleFavorite(id: string, fav: boolean) {
    await toggleFavoriteVoice(id, fav);
    setHistoryItems((prev) =>
      prev.map((h) =>
        h.generation.id === id
          ? { ...h, generation: { ...h.generation, is_favorite: fav } }
          : h
      )
    );
  }

  async function handleDuplicate(id: string) {
    const result = await duplicateVoice(id);
    if (result.success && result.generation) {
      const newItem: VoiceHistoryItem = {
        generation: result.generation,
        job: result.job ?? null,
      };
      setHistoryItems((prev) => [newItem, ...prev]);
      router.refresh();
    }
    return { success: result.success, message: result.message };
  }

  async function handleCancel(jobId: string) {
    await cancelJob(jobId);
    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    router.refresh();
  }

  async function handleTranscribe() {
    if (!uploadedAudioPath) return;
    const result = await transcribeAudio({ audioStoragePath: uploadedAudioPath });
    if (result.success && result.generation) {
      const newItem: VoiceHistoryItem = { generation: result.generation, job: null };
      setHistoryItems((prev) => [newItem, ...prev]);
      setSelectedId(result.generation.id);
      router.refresh();
    }
    return { success: result.success, message: result.message };
  }

  function handleDownload() {
    if (!resolvedAudioUrl || !selectedItem) return;
    const a = document.createElement("a");
    a.href = resolvedAudioUrl;
    a.download = `${selectedItem.generation.id}.mp3`;
    a.click();
  }

  const transcriptData = selectedItem?.generation.transcript_data as Record<string, unknown> | null;

  return (
    <div className="flex h-full">
      {/* Left panel: VoiceLibrary sidebar */}
      <div className="w-72 shrink-0 border-r overflow-hidden">
        <div className="w-72 h-full p-3 overflow-y-auto">
          <VoiceLibrary
            items={historyItems}
            activeId={selectedId ?? undefined}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            onDuplicate={handleDuplicate}
          />
        </div>
      </div>

      {/* Right panel: main content area */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Tabs defaultValue="generate" className="flex flex-col h-full">
          <div className="border-b px-4">
            <TabsList>
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
              <TabsTrigger value="clone">Clone</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>

          {/* Generate Tab */}
          <TabsContent value="generate" className="flex-1 overflow-y-auto mt-0">
            <VoiceGenerator onGenerate={handleGenerate} />

            <div className="mx-auto max-w-3xl p-6 space-y-6">
              {activeJobs.length > 0 && (
                <div className="space-y-3">
                  {activeJobs
                    .filter((j) => !selectedItem || j.generation_id === selectedItem.generation.id)
                    .map((job) => (
                      <VoiceLoadingState key={job.id} job={job} onCancel={handleCancel} />
                    ))}
                </div>
              )}

              {selectedItem &&
                selectedItem.generation.status === "completed" &&
                selectedItem.generation.operation_type === "tts" &&
                resolvedAudioUrl && (
                  <div className="space-y-4">
                    <AudioPlayer
                      src={resolvedAudioUrl}
                      label={selectedItem.generation.input_text ?? undefined}
                      onDownload={handleDownload}
                    />

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleToggleFavorite(
                            selectedItem.generation.id,
                            !selectedItem.generation.is_favorite
                          )
                        }
                      >
                        <Heart className={cn("mr-2 h-4 w-4", selectedItem.generation.is_favorite && "fill-red-500 text-red-500")} />
                        {selectedItem.generation.is_favorite ? "Unfavorite" : "Favorite"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicate(selectedItem.generation.id)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleDelete(selectedItem.generation.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}

              {selectedItem &&
                selectedItem.generation.status === "completed" &&
                selectedItem.generation.operation_type === "stt" && (
                  <TranscriptViewer
                    transcript={null}
                    transcriptText={selectedItem.generation.transcript_text ?? undefined}
                    confidence={transcriptData?.confidence as number | undefined}
                    language={selectedItem.generation.input_language ?? undefined}
                  />
                )}

              {selectedItem && selectedItem.generation.status === "failed" && (
                <VoiceErrorState
                  message={selectedItem.generation.error_message ?? "This voice generation failed."}
                  onRetry={() => handleDuplicate(selectedItem.generation.id)}
                />
              )}

              {!selectedItem && activeJobs.length === 0 && historyItems.length === 0 && (
                <EmptyWorkspace />
              )}
            </div>
          </TabsContent>

          {/* Transcribe Tab */}
          <TabsContent value="transcribe" className="flex-1 overflow-y-auto mt-0">
            <div className="border-b p-4 space-y-4">
              <h2 className="text-lg font-semibold">Transcribe Audio</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Record audio from microphone:</p>
                  <AudioRecorder onRecordingComplete={() => {}} />
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Or upload an audio file:</p>
                  <AudioUpload
                    onUploaded={(path) => setUploadedAudioPath(path)}
                    purpose="audio"
                  />
                </div>
                <Button onClick={handleTranscribe} disabled={!uploadedAudioPath}>
                  Transcribe (8 credits)
                </Button>
              </div>
            </div>

            <div className="mx-auto max-w-3xl p-6 space-y-6">
              {selectedItem &&
                selectedItem.generation.status === "completed" &&
                selectedItem.generation.operation_type === "stt" && (
                  <TranscriptViewer
                    transcript={null}
                    transcriptText={selectedItem.generation.transcript_text ?? undefined}
                    confidence={transcriptData?.confidence as number | undefined}
                    language={selectedItem.generation.input_language ?? undefined}
                  />
                )}

              {selectedItem && selectedItem.generation.status === "failed" && (
                <VoiceErrorState
                  message={selectedItem.generation.error_message ?? "Transcription failed."}
                  onRetry={() => handleDuplicate(selectedItem.generation.id)}
                />
              )}
            </div>
          </TabsContent>

          {/* Clone Tab */}
          <TabsContent value="clone" className="flex-1 overflow-y-auto mt-0">
            <div className="mx-auto max-w-4xl p-6 space-y-6">
              <VoiceCloneManager />
            </div>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="flex-1 overflow-y-auto mt-0">
            <div className="mx-auto max-w-4xl p-6 space-y-6">
              {historyItems.length === 0 ? (
                <EmptyWorkspace />
              ) : (
                historyItems.map((item) => {
                  const isTts = item.generation.operation_type === "tts";
                  const url = isTts && item.generation.output_audio_path
                    ? audioUrls.get(item.generation.output_audio_path)
                    : null;

                  return (
                    <div key={item.generation.id} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{item.generation.operation_type.toUpperCase()}</Badge>
                          <Badge variant="secondary">{item.generation.model}</Badge>
                          <Badge
                            variant={
                              item.generation.status === "completed"
                                ? "default"
                                : item.generation.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {item.generation.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.generation.created_at).toLocaleString()}
                        </span>
                      </div>

                      {item.generation.input_text && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.generation.input_text}
                        </p>
                      )}

                      {isTts && url && (
                        <AudioPlayer src={url} label={item.generation.input_text ?? undefined} />
                      )}

                      {item.generation.operation_type === "stt" && item.generation.transcript_text && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-sm whitespace-pre-wrap">{item.generation.transcript_text}</p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-2xl">
        <Music className="text-muted-foreground h-10 w-10" />
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight">Voice Studio</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm">
        Generate natural-sounding speech, transcribe audio files, clone voices,
        and more. Choose a tab above to get started.
      </p>
    </div>
  );
}
