"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Files,
  Users,
  HardDrive,
  Clock,
  Star,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDocuments } from "@/services/document";
import { getFiles, getStorageUsage } from "@/services/file-library";
import { getWorkspaceMembers } from "@/services/workspace";
import { getActivityLogs } from "@/services/activity-log";
import type { DocumentWithCreator } from "@/services/document";
import type { FileWithUploader } from "@/services/file-library";
import type { MemberWithProfile } from "@/services/workspace";
import type { ActivityLog } from "@/types/generated/database";

interface WorkspaceDashboardProps {
  workspaceId: string;
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
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function WorkspaceDashboard({ workspaceId }: WorkspaceDashboardProps) {
  const [documents, setDocuments] = useState<DocumentWithCreator[]>([]);
  const [files, setFiles] = useState<FileWithUploader[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [storageBytes, setStorageBytes] = useState<number>(0);

  const fetchData = useCallback(() => {
    getDocuments({
      filters: { workspace_id: workspaceId },
      page: 1,
      page_size: 5,
    }).then((res) => {
      if (res.success && res.documents) setDocuments(res.documents);
    });

    getFiles({ workspace_id: workspaceId }, 1, 5).then((res) => {
      if (res.success && res.files) setFiles(res.files);
    });

    getWorkspaceMembers(workspaceId).then((data) => setMembers(data));

    getActivityLogs(10).then((logs) => setActivities(logs));

    getStorageUsage(workspaceId).then((res) => {
      if (res.success && res.totalBytes !== undefined) setStorageBytes(res.totalBytes);
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
            <p className="text-muted-foreground text-xs">Across all folders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <Files className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{files.length}</div>
            <p className="text-muted-foreground text-xs">Uploaded files</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-muted-foreground text-xs">Active collaborators</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(storageBytes)}</div>
            <p className="text-muted-foreground text-xs">Of 1 GB limit</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Documents
            </CardTitle>
            <CardDescription>Last 5 documents created or updated.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {doc.document_type}
                        </Badge>
                        <Badge
                          variant={doc.status === "published" ? "default" : "outline"}
                          className="text-xs"
                        >
                          {doc.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-muted-foreground text-right text-xs">
                      <p>{formatTime(doc.updated_at)}</p>
                      <p>{doc.word_count} words</p>
                    </div>
                  </div>
                ))}
                {documents.length === 0 && (
                  <p className="text-muted-foreground text-sm">No documents yet.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Files */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Files className="h-5 w-5" />
              Recent Files
            </CardTitle>
            <CardDescription>Last 5 uploaded files.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-96">
              <div className="space-y-3">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.original_name}</p>
                      <p className="text-muted-foreground text-xs">{file.mime_type}</p>
                    </div>
                    <div className="text-muted-foreground text-right text-xs">
                      <p>{formatBytes(file.size_bytes)}</p>
                      <p>{formatTime(file.created_at)}</p>
                    </div>
                  </div>
                ))}
                {files.length === 0 && (
                  <p className="text-muted-foreground text-sm">No files yet.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Team Activity
          </CardTitle>
          <CardDescription>Recent activity across the workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <div className="space-y-4">
              {activities.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="bg-primary/10 text-primary mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {log.action.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {log.description || log.action}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatTime(log.created_at)}</p>
                  </div>
                </div>
              ))}
              {activities.length === 0 && (
                <p className="text-muted-foreground text-sm">No recent activity.</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
