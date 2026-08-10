"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload,
  Search,
  Download,
  Trash2,
  File,
  ImageIcon,
  FileText,
  Video,
  Music,
  Archive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getFiles, uploadFile, downloadFile, deleteFile } from "@/services/file-library";
import type { FileWithUploader } from "@/services/file-library";

interface FileExplorerProps {
  workspaceId: string;
  folderId: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <ImageIcon className="h-8 w-8 text-pink-500" />;
  if (mimeType.startsWith("video/")) return <Video className="h-8 w-8 text-purple-500" />;
  if (mimeType.startsWith("audio/")) return <Music className="h-8 w-8 text-emerald-500" />;
  if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("document"))
    return <FileText className="h-8 w-8 text-blue-500" />;
  if (mimeType.includes("zip") || mimeType.includes("archive")) return <Archive className="h-8 w-8 text-orange-500" />;
  return <File className="h-8 w-8 text-gray-500" />;
}

export function FileExplorer({ workspaceId, folderId }: FileExplorerProps) {
  const [files, setFiles] = useState<FileWithUploader[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(() => {
    const filters: Record<string, unknown> = {
      workspace_id: workspaceId,
      sort_by: "created_at",
      sort_order: "desc",
    };
    if (folderId !== null) filters.folder_id = folderId;
    if (search.trim()) filters.search = search.trim();
    if (typeFilter !== "all") filters.mime_type = typeFilter;

    getFiles(filters, 1, 50).then((res) => {
      if (res.success && res.files) setFiles(res.files);
    });
  }, [workspaceId, folderId, search, typeFilter]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  function handleUpload(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    setIsUploading(true);
    const uploadPromises = Array.from(filesList).map((f) =>
      uploadFile(workspaceId, f, folderId ?? undefined),
    );
    Promise.all(uploadPromises).then(() => {
      setIsUploading(false);
      fetchFiles();
    });
  }

  function handleDownload(fileId: string) {
    downloadFile(fileId).then((res) => {
      if (res.success && res.signedUrl) {
        window.open(res.signedUrl, "_blank");
      }
    });
  }

  function handleDelete(fileId: string, e: React.MouseEvent) {
    e.stopPropagation();
    deleteFile(fileId).then(() => fetchFiles());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="File type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="image/png">Images</SelectItem>
            <SelectItem value="application/pdf">PDF</SelectItem>
            <SelectItem value="video/mp4">Video</SelectItem>
            <SelectItem value="audio/mpeg">Audio</SelectItem>
            <SelectItem value="text/plain">Text</SelectItem>
          </SelectContent>
        </Select>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="mr-2 h-4 w-4" />
          {isUploading ? "Uploading..." : "Upload"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => (
          <Card
            key={file.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => handleDownload(file.id)}
          >
            <CardContent className="flex flex-col items-center p-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                {getFileIcon(file.mime_type)}
              </div>
              <div className="mt-3 w-full text-center">
                <p className="truncate text-sm font-medium">{file.original_name}</p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <span className="text-muted-foreground text-xs">{formatBytes(file.size_bytes)}</span>
                  <span className="text-muted-foreground text-xs">{formatTime(file.created_at)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => { e.stopPropagation(); handleDownload(file.id); }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={(e) => handleDelete(file.id, e)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Upload className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground mt-4 text-sm">No files found.</p>
        </div>
      )}
    </div>
  );
}
