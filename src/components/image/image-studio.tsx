"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PromptInput } from "./prompt-input";
import { ImageSettings } from "./image-settings";
import { ModelSelector } from "./model-selector";
import { GenerateButton } from "./generate-button";
import { ImagePreview } from "./image-preview";
import { ImageGallery } from "./image-gallery";
import { ImageDetails } from "./image-details";
import { PromptLibrary } from "./prompt-library";
import { LoadingState } from "./loading-state";
import { ErrorState } from "./error-state";
import { ImageIcon } from "lucide-react";
import {
  generateImage,
  deleteImage,
  getSignedImageUrls,
  getSignedImageUrl,
  getSavedPrompts,
  toggleFavoriteImage,
  duplicateImage,
} from "@/services/image/actions";
import { DEFAULT_IMAGE_SETTINGS } from "@/services/image/types";
import type { ImageHistoryItem } from "@/services/image/actions";
import type {
  ImageSize,
  ImageQuality,
  ImageStylePreset,
  AspectRatio,
} from "@/services/image/types";
import type { ImagePrompt } from "@/types/generated/database";
import { getDefaultImageModel } from "@/services/image/models";

interface ImageStudioProps {
  initialHistory: ImageHistoryItem[];
  initialPrompts: ImagePrompt[];
}

export function ImageStudio({ initialHistory, initialPrompts }: ImageStudioProps) {
  const router = useRouter();
  const defaultModel = getDefaultImageModel();

  const [historyItems, setHistoryItems] = useState<ImageHistoryItem[]>(initialHistory);
  const [savedPrompts, setSavedPrompts] = useState<ImagePrompt[]>(initialPrompts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<ImageSize>(DEFAULT_IMAGE_SETTINGS.size);
  const [quality, setQuality] = useState<ImageQuality>(DEFAULT_IMAGE_SETTINGS.quality);
  const [style, setStyle] = useState<ImageStylePreset>(DEFAULT_IMAGE_SETTINGS.style);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(DEFAULT_IMAGE_SETTINGS.aspectRatio);
  const [numImages, setNumImages] = useState(1);
  const [modelId, setModelId] = useState(defaultModel.id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(null);

  const selectedItem = historyItems.find((h) => h.generation.id === selectedId) ?? null;

  // Fetch signed URLs for all completed assets on mount
  useEffect(() => {
    async function fetchUrls() {
      const paths = initialHistory
        .filter((h) => h.asset && h.generation.status === "completed")
        .map((h) => h.asset!.storage_path);

      if (paths.length > 0) {
        const urls = await getSignedImageUrls(paths);
        setImageUrls(urls);
      }
    }
    fetchUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch saved prompts on mount
  useEffect(() => {
    async function fetchPrompts() {
      const prompts = await getSavedPrompts();
      setSavedPrompts(prompts);
    }
    fetchPrompts();
  }, []);

  // Fetch signed URL when selecting an image
  const fetchPreviewUrl = useCallback(async (storagePath: string) => {
    const url = await getSignedImageUrl(storagePath);
    setCurrentPreviewUrl(url);
    return url;
  }, []);

  // When selectedId changes, update preview URL
  useEffect(() => {
    if (!selectedId) {
      setCurrentPreviewUrl(null);
      return;
    }
    const item = historyItems.find((h) => h.generation.id === selectedId);
    if (item?.asset) {
      const cached = imageUrls.get(item.asset.storage_path);
      if (cached) {
        setCurrentPreviewUrl(cached);
      } else {
        fetchPreviewUrl(item.asset.storage_path);
      }
    } else {
      setCurrentPreviewUrl(null);
    }
  }, [selectedId, historyItems, imageUrls, fetchPreviewUrl]);

  const handleGenerate = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    const result = await generateImage({
      prompt: trimmed,
      modelId,
      settings: { size, quality, style, aspectRatio, numImages },
    });

    if (!result.success) {
      setError(result.message);
      setIsGenerating(false);
      return;
    }

    if (result.generation && result.assets && result.assets.length > 0) {
      const newItems: ImageHistoryItem[] = result.assets.map((asset) => ({
        generation: result.generation!,
        asset,
      }));

      setHistoryItems((prev) => [...newItems, ...prev]);
      setSelectedId(result.generation.id);

      // Fetch signed URLs for new images
      for (const asset of result.assets) {
        const url = await getSignedImageUrl(asset.storage_path);
        if (url) {
          setImageUrls((prev) => {
            const next = new Map(prev);
            next.set(asset.storage_path, url);
            return next;
          });
          setCurrentPreviewUrl(url);
        }
      }
    }

    setIsGenerating(false);
    router.refresh();
  }, [prompt, size, quality, style, aspectRatio, numImages, modelId, isGenerating, router]);

  const handleDelete = useCallback(async (generationId: string) => {
    const result = await deleteImage(generationId);
    if (result.success) {
      setHistoryItems((prev) => prev.filter((h) => h.generation.id !== generationId));
      if (selectedId === generationId) {
        setSelectedId(null);
        setCurrentPreviewUrl(null);
      }
      router.refresh();
    }
  }, [selectedId, router]);

  const handleToggleFavorite = useCallback(async (generationId: string, isFavorite: boolean) => {
    await toggleFavoriteImage(generationId, isFavorite);
    setHistoryItems((prev) =>
      prev.map((h) =>
        h.generation.id === generationId
          ? { ...h, generation: { ...h.generation, is_favorite: isFavorite } }
          : h
      )
    );
  }, []);

  const handleDuplicate = useCallback(async (generationId: string) => {
    const result = await duplicateImage(generationId);
    if (result.success && result.generation && result.assets?.[0]) {
      const newItem: ImageHistoryItem = {
        generation: result.generation,
        asset: result.assets[0],
      };
      setHistoryItems((prev) => [newItem, ...prev]);
      const url = await getSignedImageUrl(result.assets[0].storage_path);
      if (url) {
        setImageUrls((prev) => {
          const next = new Map(prev);
          next.set(result.assets![0].storage_path, url);
          return next;
        });
      }
      router.refresh();
    }
  }, [router]);

  const handleUsePrompt = useCallback((p: string) => {
    setPrompt(p);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left: Gallery panel */}
      <div className="w-72 shrink-0 border-r overflow-hidden">
        <div className="w-72 h-full p-3 overflow-y-auto">
          <ImageGallery
            items={historyItems}
            activeId={selectedId ?? undefined}
            imageUrls={imageUrls}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            onToggleFavorite={handleToggleFavorite}
            onDuplicate={handleDuplicate}
          />
        </div>
      </div>

      {/* Right: Main workspace */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Generation controls */}
        <div className="border-b p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold">Create Image</h2>
            <ModelSelector value={modelId} onValueChange={setModelId} disabled={isGenerating} />
          </div>
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
          />
          <ImageSettings
            size={size}
            quality={quality}
            style={style}
            aspectRatio={aspectRatio}
            numImages={numImages}
            modelId={modelId}
            onSizeChange={setSize}
            onQualityChange={setQuality}
            onStyleChange={setStyle}
            onAspectRatioChange={setAspectRatio}
            onNumImagesChange={setNumImages}
            disabled={isGenerating}
          />
          <GenerateButton onClick={handleGenerate} disabled={!prompt.trim()} isGenerating={isGenerating} />
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl p-6 space-y-6">
            {isGenerating && <LoadingState />}

            {error && !isGenerating && (
              <ErrorState message={error} onRetry={() => setError(null)} />
            )}

            {/* Selected image preview */}
            {selectedItem && !isGenerating && !error && (
              <div className="space-y-6">
                {selectedItem.generation.status === "completed" && currentPreviewUrl ? (
                  <ImagePreview
                    item={selectedItem}
                    imageUrl={currentPreviewUrl}
                    onClose={() => setSelectedId(null)}
                    onToggleFavorite={() =>
                      handleToggleFavorite(selectedItem.generation.id, !selectedItem.generation.is_favorite)
                    }
                    onDuplicate={() => handleDuplicate(selectedItem.generation.id)}
                    isFavorite={selectedItem.generation.is_favorite}
                  />
                ) : selectedItem.generation.status === "failed" ? (
                  <ErrorState
                    message={selectedItem.generation.error_message ?? "This generation failed."}
                  />
                ) : null}

                {/* Details + Prompt Library tabs */}
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="prompts">Prompts</TabsTrigger>
                  </TabsList>
                  <TabsContent value="details" className="mt-4">
                    <ImageDetails item={selectedItem} />
                  </TabsContent>
                  <TabsContent value="prompts" className="mt-4">
                    <PromptLibrary
                      prompts={savedPrompts}
                      onUse={handleUsePrompt}
                      onRefresh={async () => {
                        const prompts = await getSavedPrompts();
                        setSavedPrompts(prompts);
                      }}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}

            {/* Empty state */}
            {!selectedItem && !isGenerating && !error && historyItems.length === 0 && (
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
        <ImageIcon className="text-muted-foreground h-10 w-10" />
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight">Image Studio</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm">
        Describe what you want to see, adjust the settings, and let AI generate
        stunning images for you. All images are saved securely in your gallery.
      </p>
    </div>
  );
}
