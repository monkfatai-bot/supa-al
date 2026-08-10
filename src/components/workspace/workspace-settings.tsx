"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  HardDrive,
  AlertTriangle,
  Trash2,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getWorkspace, updateWorkspace, deleteWorkspace } from "@/services/workspace";
import { getStorageUsage } from "@/services/file-library";
import type { Workspace } from "@/services/workspace";
import { MemberManager } from "./member-manager";

interface WorkspaceSettingsProps {
  workspaceId: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function WorkspaceSettings({ workspaceId }: WorkspaceSettingsProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceType, setWorkspaceType] = useState<string>("");
  const [storageBytes, setStorageBytes] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const fetchData = useCallback(() => {
    getWorkspace(workspaceId).then((res) => {
      if (res.success && res.workspace) {
        setWorkspace(res.workspace);
        setName(res.workspace.name);
        setDescription(res.workspace.description ?? "");
        setWorkspaceType(res.workspace.workspace_type ?? "personal");
      }
    });
    getStorageUsage(workspaceId).then((res) => {
      if (res.success && res.totalBytes !== undefined) setStorageBytes(res.totalBytes);
    });
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleSave() {
    setIsSaving(true);
    updateWorkspace(workspaceId, { name, description }).then((res) => {
      if (res.success) fetchData();
      setIsSaving(false);
    });
  }

  function handleDelete() {
    deleteWorkspace(workspaceId).then(() => {
      window.location.href = "/dashboard";
    });
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Settings className="h-6 w-6" />
        Workspace Settings
      </h2>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="danger" className="text-destructive">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General Information</CardTitle>
              <CardDescription>Update your workspace name, description, and type.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ws-name">Workspace Name</Label>
                <Input
                  id="ws-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Workspace name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ws-desc">Description</Label>
                <Textarea
                  id="ws-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your workspace..."
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Workspace Type</Label>
                <Select value={workspaceType} onValueChange={setWorkspaceType}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="team">Team</SelectItem>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <MemberManager workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="storage" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-5 w-5" />
                Storage Usage
              </CardTitle>
              <CardDescription>Current storage consumption for this workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Used</span>
                  <span className="text-lg font-bold">{formatBytes(storageBytes)}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min((storageBytes / (1024 * 1024 * 1024)) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-muted-foreground text-sm">
                  {formatBytes(storageBytes)} of 1 GB used ({((storageBytes / (1024 * 1024 * 1024)) * 100).toFixed(1)}%)
                </p>
                <Separator />
                <p className="text-muted-foreground text-xs">
                  Storage includes all uploaded files, documents, and attachments in this workspace.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger" className="mt-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that will permanently delete data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delete Workspace</p>
                  <p className="text-muted-foreground text-xs">
                    This will permanently delete the workspace and all its contents.
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Workspace
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete the workspace
                        &quot;{workspace.name}&quot; and remove all documents, files, and data associated with it.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete Workspace
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
