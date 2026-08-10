"use client";

import type { ImageHistoryItem } from "@/services/image/actions";
import type { ImageGenerationSettings } from "@/services/image";

interface ImageDetailsProps {
  item: ImageHistoryItem;
}

export function ImageDetails({ item }: ImageDetailsProps) {
  const settings = item.generation.settings as ImageGenerationSettings | null;
  const metadata = item.asset?.metadata as {
    width?: number;
    height?: number;
    format?: string;
    revisedPrompt?: string;
    sizeBytes?: number;
  } | null;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium">Generation Details</h4>
        <div className="mt-2 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className={`capitalize font-medium ${item.generation.status === "completed" ? "text-green-600" : item.generation.status === "failed" ? "text-destructive" : ""}`}>
              {item.generation.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className="capitalize">{item.generation.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Model</span>
            <span>{item.generation.model}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>
              {new Date(item.generation.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      </div>

      {settings && (
        <div>
          <h4 className="text-sm font-medium">Settings</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Size</span>
              <span>{settings.size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quality</span>
              <span className="capitalize">{settings.quality}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Style</span>
              <span className="capitalize">{settings.style}</span>
            </div>
          </div>
        </div>
      )}

      {metadata && (
        <div>
          <h4 className="text-sm font-medium">Image Info</h4>
          <div className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dimensions</span>
              <span>{metadata.width ?? "?"} x {metadata.height ?? "?"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Format</span>
              <span className="uppercase">{metadata.format ?? "?"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">File Size</span>
              <span>{metadata.sizeBytes ? `${(metadata.sizeBytes / 1024).toFixed(0)} KB` : "?"}</span>
            </div>
          </div>
        </div>
      )}

      {metadata?.revisedPrompt && (
        <div>
          <h4 className="text-sm font-medium">Revised Prompt</h4>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            {metadata.revisedPrompt}
          </p>
        </div>
      )}

      {item.generation.error_message && (
        <div>
          <h4 className="text-sm font-medium text-destructive">Error</h4>
          <p className="text-destructive mt-1 text-sm">
            {item.generation.error_message}
          </p>
        </div>
      )}
    </div>
  );
}