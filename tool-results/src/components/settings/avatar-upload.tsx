"use client";

/**
 * Supa AI — Avatar upload.
 *
 * A drag-and-drop + click-to-pick avatar uploader. The file is uploaded
 * directly to Supabase Storage's `avatars` bucket using the browser
 * Supabase client (`createSupabaseBrowserClient`) — RLS allows the owner
 * to upload into their own folder. After a successful upload the public
 * URL is persisted on the `profiles.avatar_url` column via the
 * `/api/profile/update` API.
 *
 * Constraints (mirrored from `BUCKET_LIMITS.avatars`):
 *   - MIME: image/jpeg, image/png, image/webp, image/gif
 *   - Max size: 2 MB
 *
 * UX:
 *   - Validates MIME + size BEFORE the upload starts.
 *   - Shows a circular preview of the chosen image.
 *   - Streams the upload progress (XHR-style) — Supabase's JS client
 *     exposes an `uploadProgress` callback in newer versions; we fall back
 *     to an indeterminate spinner when not.
 *   - "Remove photo" button sets `avatar_url = null` via the same API.
 *
 * @module @/components/settings/avatar-upload
 */
import * as React from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUpdateProfile } from "@/hooks/use-settings";
import type { Profile } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_BUCKET = "avatars";

export interface AvatarUploadProps {
  /** Current profile (for the avatar URL + fallback initials). */
  profile: Profile;
  /** Email is used to derive the initials fallback when no full_name. */
  email?: string | null;
}

/** Derive a 2-letter initials fallback for the avatar. */
function initialsFor(profile: Profile, email?: string | null): string {
  const fromName =
    profile.full_name?.trim() ||
    profile.username?.trim() ||
    email?.trim() ||
    "";
  if (!fromName) return "U";
  const parts = fromName.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resolve the file extension for the chosen image MIME type. */
function extForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

export function AvatarUpload({ profile, email }: AvatarUploadProps) {
  const updateProfile = useUpdateProfile();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isRemoving, setIsRemoving] = React.useState(false);

  // Revoke object URLs on unmount / change to avoid leaks.
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentAvatarUrl = previewUrl ?? profile.avatar_url ?? null;

  async function handleFile(file: File): Promise<void> {
    // ----- Client-side validation (defense in depth before upload). -----
    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("Unsupported image format", {
        description: "Please upload a JPEG, PNG, WebP, or GIF image.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large", {
        description: `Maximum size is 2 MB. Yours is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
      });
      return;
    }

    // ----- Preview (object URL is auto-revoked on unmount). -----
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // ----- Upload via the browser Supabase client (RLS = owner-only). -----
    setProgress(0);
    try {
      const supabase = createSupabaseBrowserClient();
      const ext = extForMime(file.type);
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: "3600",
        });

      if (error) {
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(path);

      if (!urlData?.publicUrl) {
        throw new Error("Storage returned no public URL.");
      }

      // ----- Persist the public URL on the profile row. -----
      setProgress(100);
      await updateProfile.mutateAsync({
        avatar_url: urlData.publicUrl,
      });

      toast.success("Avatar updated", {
        description: "Your new profile photo is live.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      toast.error("Couldn't upload image", { description: msg });
      // Revert the preview on failure.
      setPreviewUrl(null);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function onRemove() {
    setIsRemoving(true);
    try {
      await updateProfile.mutateAsync({
        avatar_url: null,
      });
      setPreviewUrl(null);
      toast.success("Photo removed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Remove failed.";
      toast.error("Couldn't remove photo", { description: msg });
    } finally {
      setIsRemoving(false);
    }
  }

  const busy = updateProfile.isPending || progress !== null;
  const initials = initialsFor(profile, email);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="flex flex-col items-center gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload new photo"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            "group relative flex size-24 cursor-pointer items-center justify-center rounded-full ring-1 ring-transparent transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragging && "ring-2 ring-brand ring-offset-2 ring-offset-background",
          )}
        >
          <Avatar className="size-24">
            {currentAvatarUrl ? (
              <AvatarImage src={currentAvatarUrl} alt="Your avatar" />
            ) : null}
            <AvatarFallback className="text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/55 text-white opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-visible:opacity-100",
              busy && "opacity-100",
            )}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <>
                <Camera className="size-5" aria-hidden="true" />
                <span className="text-xs font-medium">Change</span>
              </>
            )}
          </span>
        </div>
        {progress !== null ? (
          <div className="w-32">
            <Progress value={progress} aria-label="Upload progress" />
            <p className="mt-1 text-center text-xs text-muted-foreground">
              {progress < 100 ? "Uploading…" : "Saving…"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:items-start">
        <div className="space-y-1">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground text-pretty">
            Square images render best. JPEG, PNG, WebP, or GIF up to 2 MB.
            Drag and drop or click to choose.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            {profile.avatar_url ? "Replace photo" : "Upload new photo"}
          </Button>
          {profile.avatar_url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || isRemoving}
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              {isRemoving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              Remove photo
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME.join(",")}
        onChange={onInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
