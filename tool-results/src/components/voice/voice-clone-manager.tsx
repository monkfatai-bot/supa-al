"use client";

/**
 * Supa AI — Voice clone manager (Phase 8).
 *
 * Lets the caller:
 *   - Pick a provider that supports cloning (ElevenLabs / PlayHT today).
 *   - Upload a sample audio file.
 *   - Submit → calls `/api/voice/clone` → creates a generation + job that
 *     runs in the background. The result row is shown via {@link VoiceProfileCard}
 *     when the job completes.
 *
 * Also lists existing cloned voice profiles for the workspace.
 *
 * @module @/components/voice/voice-clone-manager
 */
import * as React from "react";
import { Loader2, Mic, Sparkles, Upload } from "lucide-react";

import type {
  VoiceProfile,
} from "@/lib/voice/client";
import {
  useClone,
  useUploadAudio,
  useVoiceProfiles,
} from "@/hooks/use-voice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import type { ApiResponse } from "@/types/api";

const CLONEABLE_PROVIDERS = ["elevenlabs", "playht"] as const;

export function VoiceCloneManager() {
  const upload = useUploadAudio();
  const clone = useClone();
  const profiles = useVoiceProfiles({ isCloned: true, limit: 50 });

  const [provider, setProvider] = React.useState<string>(CLONEABLE_PROVIDERS[0]!);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [uploadedId, setUploadedId] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const clonedProfiles = (profiles.data ?? []) as VoiceProfile[];

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploadedId(null);
    const result = await upload.mutateAsync(file);
    setUploadedId((result as { upload: { id: string } }).upload.id);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadedId || !name.trim() || !provider) return;
    await clone.mutateAsync({
      audioUploadId: uploadedId as never,
      provider: provider as never,
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setName("");
    setDescription("");
    setFileName(null);
    setUploadedId(null);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Clone a voice</h3>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="clone-provider" className="text-xs uppercase tracking-wide text-muted-foreground">
                Provider
              </Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="clone-provider">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {CLONEABLE_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="capitalize">{p}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-name" className="text-xs uppercase tracking-wide text-muted-foreground">
                Voice name
              </Label>
              <Input
                id="clone-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marketing narrator"
                maxLength={80}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-desc" className="text-xs uppercase tracking-wide text-muted-foreground">
              Description (optional)
            </Label>
            <Input
              id="clone-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A short description of the cloned voice."
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clone-file" className="text-xs uppercase tracking-wide text-muted-foreground">
              Sample audio (30s+ recommended)
            </Label>
            <Input
              id="clone-file"
              type="file"
              accept="audio/*"
              onChange={onFileChange}
            />
            {fileName ? (
              <p className="text-[11px] text-muted-foreground">
                {upload.isPending ? "Uploading…" : "Ready: "}{fileName}
              </p>
            ) : null}
            {upload.error ? (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                Upload failed: {upload.error instanceof Error ? upload.error.message : "unknown"}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={onSubmit} disabled={!uploadedId || !name.trim() || clone.isPending}>
              {clone.isPending ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="mr-1.5 size-4" aria-hidden="true" />
              )}
              Clone voice
            </Button>
          </div>

          {clone.error ? (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {clone.error instanceof Error ? clone.error.message : "Clone failed."}
            </p>
          ) : null}

          {clone.data ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="font-medium">Clone queued</p>
              <p className="text-muted-foreground">
                Generation id:{" "}
                <code className="font-mono">
                  {(clone.data as { generation: { id: string } }).generation.id}
                </code>
              </p>
              <p className="text-muted-foreground">
                Job id:{" "}
                <code className="font-mono">
                  {(clone.data as { job: { id: string } }).job.id}
                </code>
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Cloned voices</h3>
        {profiles.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : clonedProfiles.length === 0 ? (
          <EmptyState
            icon={Mic}
            title="No cloned voices yet"
            description="Clone a voice using the form above. Cloned voices will appear here once their background job completes."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clonedProfiles.map((p) => (
              <Card key={p.id}>
                <CardHeader className="border-b py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold">{p.name}</h4>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {p.provider}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 p-3 text-xs text-muted-foreground">
                  <p>
                    Voice id:{" "}
                    <code className="break-all font-mono text-[10px]">{p.voice_id}</code>
                  </p>
                  <p>Created {new Date(p.created_at).toLocaleDateString()}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
