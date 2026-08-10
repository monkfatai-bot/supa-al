"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, FileAudio } from "lucide-react";
import { uploadSourceFile } from "@/services/voice/actions";

interface AudioUploadProps {
  onUploaded: (storagePath: string, fileName: string) => void;
  purpose: "audio" | "image";
  accept?: string;
}

export function AudioUpload({ onUploaded, purpose, accept }: AudioUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultAccept = purpose === "audio" ? "audio/*" : "image/*";
  const acceptValue = accept ?? defaultAccept;
  const maxSizeLabel = purpose === "audio" ? "500MB" : "20MB";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSizeBytes = purpose === "audio" ? 524_288_000 : 20_971_520;
    if (file.size > maxSizeBytes) {
      setError(`File too large. Maximum size is ${maxSizeLabel}.`);
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadedFile(file.name);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", purpose);

    const result = await uploadSourceFile(formData);
    if (result.success && result.storagePath) {
      onUploaded(result.storagePath, file.name);
    } else {
      setError(result.message);
      setUploadedFile(null);
    }

    setIsUploading(false);
  }

  function clearFile() {
    setUploadedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-3">
      <label className="cursor-pointer">
        <input
          ref={inputRef}
          type="file"
          accept={acceptValue}
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        <Button variant="outline" size="sm" asChild disabled={isUploading}>
          <span>
            {isUploading ? (
              <><span className="animate-spin mr-2">&#9696;</span>Uploading...</>
            ) : (
              <><Upload className="mr-2 h-4 w-4" />Upload {purpose === "audio" ? "Audio" : "Image"}</>
            )}
          </span>
        </Button>
      </label>

      {uploadedFile && (
        <div className="flex items-center gap-2 text-sm">
          <FileAudio className="h-4 w-4 text-muted-foreground" />
          <span className="max-w-48 truncate">{uploadedFile}</span>
          <button
            type="button"
            onClick={clearFile}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!uploadedFile && !isUploading && (
        <span className="text-sm text-muted-foreground">
          Max {maxSizeLabel}
        </span>
      )}

      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
    </div>
  );
}
