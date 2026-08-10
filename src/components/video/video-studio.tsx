"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoGenerator } from "./video-generator";
import { VideoGallery } from "./video-gallery";
import { VideoDetails } from "./video-details";
import { VideoPlayer } from "./video-player";
import { VideoLoadingState } from "./loading-state";
import { VideoErrorState } from "./error-state";
import { VideoIcon } from "lucide-react";
import {
  generateVideo,
  deleteVideo,
  getSignedVideoUrl,
  getSignedVideoUrlsForPaths,
  cancelJob,
  toggleFavoriteVideo,
  duplicateVideo,
  getActiveJobs,
} from "@/services/video/actions";
import type { VideoHistoryItem } from "@/services/video/actions";
import type { VideoJob } from "@/types/generated/database";

interface VideoStudioProps {
  initialHistory: VideoHistoryItem[];
}

export function VideoStudio({ initialHistory }: VideoStudioProps) {
  const router = useRouter();
  const [historyItems, setHistoryItems] = useState<VideoHistoryItem[]>(initialHistory);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<VideoJob[]>([]);
  const [videoUrls, setVideoUrls] = useState<Map<string, string>>(new Map());
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedItem = historyItems.find((h) => h.generation.id === selectedId) ?? null;

  // Derive video URL from selected item + cache
  const resolvedVideoUrl = selectedItem?.generation.video_storage_path
    ? (videoUrls.get(selectedItem.generation.video_storage_path) ?? null)
    : null;

  const resolvedThumbnailUrl = selectedItem?.generation.thumbnail_storage_path
    ? (videoUrls.get(selectedItem.generation.thumbnail_storage_path) ?? null)
    : null;

  // Fetch signed URLs for completed videos on mount
  useEffect(() => {
    async function fetchUrls() {
      const paths = initialHistory
        .filter((h) => h.generation.status === "completed" && h.generation.video_storage_path)
        .flatMap((h) => {
          const paths: string[] = [];
          if (h.generation.video_storage_path) paths.push(h.generation.video_storage_path);
          if (h.generation.thumbnail_storage_path) paths.push(h.generation.thumbnail_storage_path);
          return paths;
        });

      if (paths.length > 0) {
        const urls = await getSignedVideoUrlsForPaths(paths);
        setVideoUrls(urls);
      }
    }
    fetchUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll active jobs
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

  // Fetch URL for a specific storage path (used when cache misses)
  const fetchAndSetVideoUrl = useCallback(async (storagePath: string) => {
    const url = await getSignedVideoUrl(storagePath);
    if (url) {
      setVideoUrls((prev) => {
        const next = new Map(prev);
        next.set(storagePath, url);
        return next;
      });
    }
  }, []);

  const handleGenerate = useCallback(async (input: {
    prompt: string;
    negativePrompt?: string;
    modelId?: string;
    settings?: Record<string, unknown>;
    sourceImageStoragePath?: string;
  }) => {
    const result = await generateVideo(input);
    if (result.success && result.generation && result.job) {
      const newItem: VideoHistoryItem = {
        generation: result.generation,
        job: result.job,
      };
      setHistoryItems((prev) => [newItem, ...prev]);
      setSelectedId(result.generation.id);
      setActiveJobs((prev) => [...prev, result.job!]);
      router.refresh();
    }
    return result;
  }, [router]);

  const handleDelete = useCallback(async (generationId: string) => {
    const result = await deleteVideo(generationId);
    if (result.success) {
      setHistoryItems((prev) => prev.filter((h) => h.generation.id !== generationId));
      if (selectedId === generationId) {
        setSelectedId(null);
      }
      router.refresh();
    }
    return result;
  }, [selectedId, router]);

  const handleToggleFavorite = useCallback(async (generationId: string, isFavorite: boolean) => {
    await toggleFavoriteVideo(generationId, isFavorite);
    setHistoryItems((prev) =>
      prev.map((h) =>
        h.generation.id === generationId
          ? { ...h, generation: { ...h.generation, is_favorite: isFavorite } }
          : h
      )
    );
  }, []);

  const handleCancel = useCallback(async (jobId: string) => {
    await cancelJob(jobId);
    setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
    router.refresh();
  }, [router]);

  const handleDuplicate = useCallback(async (generationId: string) => {
    const result = await duplicateVideo(generationId);
    if (result.success && result.generation && result.job) {
      const newItem: VideoHistoryItem = {
        generation: result.generation,
        job: result.job,
      };
      setHistoryItems((prev) => [newItem, ...prev]);
      router.refresh();
    }
    return result;
  }, [router]);

  // Auto-fetch URL when resolvedVideoUrl is null but item has a storage path
  useEffect(() => {
    if (
      selectedItem?.generation.status === "completed" &&
      selectedItem.generation.video_storage_path &&
      !videoUrls.has(selectedItem.generation.video_storage_path)
    ) {
      void fetchAndSetVideoUrl(selectedItem.generation.video_storage_path);
    }
  }, [selectedItem, videoUrls, fetchAndSetVideoUrl]);

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r overflow-hidden">
        <div className="w-72 h-full p-3 overflow-y-auto">
          <VideoGallery
            items={historyItems}
            activeId={selectedId ?? undefined}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            onDuplicate={handleDuplicate}
          />
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <VideoGenerator onGenerate={handleGenerate} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6 space-y-6">
            {activeJobs.length > 0 && selectedItem && (
              <VideoLoadingState
                job={activeJobs.find((j) => j.generation_id === selectedItem?.generation.id) ?? activeJobs[0]}
                onCancel={handleCancel}
              />
            )}

            {selectedItem && selectedItem.generation.status === "completed" && resolvedVideoUrl && (
              <VideoPlayer
                item={selectedItem}
                videoUrl={resolvedVideoUrl}
                thumbnailUrl={resolvedThumbnailUrl}
                onToggleFavorite={() =>
                  handleToggleFavorite(selectedItem.generation.id, !selectedItem.generation.is_favorite)
                }
                onDuplicate={() => handleDuplicate(selectedItem.generation.id)}
                onDelete={() => handleDelete(selectedItem.generation.id)}
                isFavorite={selectedItem.generation.is_favorite}
              />
            )}

            {selectedItem && selectedItem.generation.status === "failed" && (
              <VideoErrorState
                message={selectedItem.generation.error_message ?? "This video generation failed."}
                onRetry={() => handleDuplicate(selectedItem.generation.id)}
              />
            )}

            {selectedItem && selectedItem.generation.status === "completed" && resolvedVideoUrl && (
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                  <VideoDetails item={selectedItem} />
                </TabsContent>
              </Tabs>
            )}

            {!selectedItem && activeJobs.length === 0 && historyItems.length === 0 && (
              <EmptyWorkspace />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-2xl">
        <VideoIcon className="text-muted-foreground h-10 w-10" />
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight">Video Studio</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm">
        Describe the video you want to create, configure the settings, and let AI
        generate stunning videos for you. All videos are securely stored in your gallery.
      </p>
    </div>
  );
}