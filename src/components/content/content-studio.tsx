"use client";

import { useState, useCallback } from "react";
import { ContentTypeSelector } from "./content-type-selector";
import { PromptInput } from "./prompt-input";
import { GeneratedContentViewer } from "./generated-content-viewer";
import { ContentEditor } from "./content-editor";
import { ContentHistory } from "./content-history";
import { LoadingState } from "./loading-state";
import { ErrorState } from "./error-state";
import { generateContent, regenerateContent } from "@/services/content/actions";
import type { AiContent, ContentType } from "@/services/content";

interface ContentStudioProps {
  initialContent: AiContent[];
}

export function ContentStudio({ initialContent }: ContentStudioProps) {
  const [contentList, setContentList] = useState<AiContent[]>(initialContent);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<ContentType>("general_writing");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const selectedItem = contentList.find((c) => c.id === selectedId);

  const handleGenerate = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setError(null);

    const result = await generateContent(prompt, contentType);

    if (!result.success) {
      setError(result.message);
      setIsGenerating(false);
      return;
    }

    if (result.content) {
      setContentList((prev) => [result.content!, ...prev]);
      setSelectedId(result.content.id);
      setIsEditing(false);
    }

    setIsGenerating(false);
  }, [contentType]);

  const handleRegenerate = useCallback(async (id: string) => {
    setIsGenerating(true);
    setError(null);

    const result = await regenerateContent(id);

    if (!result.success) {
      setError(result.message);
      setIsGenerating(false);
      return;
    }

    if (result.content) {
      setContentList((prev) =>
        prev.map((c) => (c.id === id ? result.content! : c))
      );
      setIsEditing(false);
    }

    setIsGenerating(false);
  }, []);

  const handleSave = useCallback((updated: AiContent) => {
    setContentList((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
    setIsEditing(false);
  }, []);

  return (
    <div className="flex h-full">
      {/* History sidebar */}
      <div className="w-72 shrink-0 border-r overflow-hidden">
        <div className="w-72 h-full">
          <ContentHistory items={contentList} activeId={selectedId ?? undefined} />
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-6">
          {/* Generation controls */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">Create Content</h2>
              <ContentTypeSelector value={contentType} onValueChange={setContentType} />
            </div>
            <PromptInput onSubmit={handleGenerate} disabled={isGenerating} />
          </div>

          {/* Output area */}
          {isGenerating && <LoadingState />}
          {error && !isGenerating && (
            <ErrorState message={error} onRetry={() => setError(null)} />
          )}

          {/* Selected content viewer / editor */}
          {selectedItem && !isGenerating && !error && (
            <div className="space-y-3">
              {isEditing ? (
                <ContentEditor
                  content={selectedItem}
                  onSave={handleSave}
                  onCancel={() => setIsEditing(false)}
                />
              ) : (
                <div className="space-y-3">
                  <GeneratedContentViewer content={selectedItem} />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                      onClick={() => setIsEditing(true)}
                    >
                      Edit Content
                    </button>
                    <span className="text-muted-foreground">|</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
                      onClick={() => handleRegenerate(selectedItem.id)}
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state when nothing selected and not generating */}
          {!selectedItem && !isGenerating && !error && contentList.length === 0 && (
            <EmptyWorkspace />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="bg-muted flex h-20 w-20 items-center justify-center rounded-2xl">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground"
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
      </div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight">Content Studio</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm">
        Select a content type, describe what you need, and let AI generate
        high-quality content for you. Your creations are saved automatically.
      </p>
    </div>
  );
}
