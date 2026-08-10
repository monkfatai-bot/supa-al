"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  getWorkspaces,
  getActiveWorkspaceId,
  createWorkspace,
} from "@/services/workspace";
import type { WorkspaceWithMemberCount } from "@/services/workspace";

export default function WorkspaceListPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMemberCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    getActiveWorkspaceId().then((id) => {
      if (id) {
        router.replace(`/workspace/${id}`);
        return;
      }
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (loading) return;
    getWorkspaces().then(setWorkspaces);
  }, [loading]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await createWorkspace(newName.trim(), newDescription.trim() || undefined);
    setCreating(false);
    if (res.success && res.workspace) {
      setDialogOpen(false);
      setNewName("");
      setNewDescription("");
      router.push(`/workspace/${res.workspace.id}`);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
            <p className="text-muted-foreground text-sm">Select a workspace or create a new one.</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workspace</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="ws-name">Name</Label>
                  <Input
                    id="ws-name"
                    placeholder="My Workspace"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ws-desc">Description (optional)</Label>
                  <Input
                    id="ws-desc"
                    placeholder="A brief description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={creating || !newName.trim()}>
                  {creating ? "Creating..." : "Create Workspace"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {workspaces.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderOpen className="text-muted-foreground mb-4 h-12 w-12" />
              <h2 className="mb-1 text-lg font-semibold">Create your first workspace</h2>
              <p className="text-muted-foreground mb-4 text-sm">
                Get started by creating a workspace for your team.
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Workspace
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <Card
                key={ws.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => router.push(`/workspace/${ws.id}`)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{ws.name}</CardTitle>
                  {ws.description && (
                    <CardDescription className="line-clamp-2">{ws.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="text-xs">
                    {ws.member_count} member{ws.member_count !== 1 ? "s" : ""}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}