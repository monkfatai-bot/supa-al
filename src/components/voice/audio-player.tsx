"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Pause, Play, Clock } from "lucide-react";

interface AudioPlayerProps {
  src: string;
  label?: string;
  onDownload?: () => void;
}

export function AudioPlayer({ src, label, onDownload }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("ended", () => {
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [src]);

  function togglePlay() {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      {label && (
        <p className="text-sm font-medium truncate">{label}</p>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={togglePlay} className="shrink-0">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="flex-1">
          <audio controls className="w-full h-10" preload="metadata">
            <source src={src} />
            Your browser does not support the audio element.
          </audio>
        </div>

        {onDownload && (
          <Button variant="outline" size="icon" onClick={onDownload} className="shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>

      {duration !== null && isFinite(duration) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
