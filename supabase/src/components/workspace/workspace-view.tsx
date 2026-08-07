"use client";

/**
 * Supa AI — Phase 9 Workspace view — main container.
 *
 * Owns the active-workspace + active-document + active-tab state and
 * composes every workspace sub-component into a single full-height
 * surface:
 *
 *   - Top bar: workspace switcher + global search trigger + "New
 *     workspace" button.
 *   - Tab bar: Dashboard / Documents / Members / Knowledge.
 *   - Dashboard tab: {@link WorkspaceDashboard}.
 *   - Documents tab: {@link FolderTree} (left) + {@link DocumentEditor}
 *     (center) + {@link VersionHistory} (right) + {@link CommentsPanel}
 *     (right) — split pane, responsive collapse on mobile.
 *   - Members tab: {@link MemberManager}.
 *   - Knowledge tab: {@link KnowledgeBase}.
 *
 * @module @/components/workspace/workspace-view
 */
import * as React from "react";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  Users,
  Briefcase,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspace/client";
import {
  useCreateDocument,
  useCreateFolder,
  useCreateWorkspace,
  useDeleteDocument,
  useDocuments,
  useDocument,
  useFolders,
  useUpdateDocument,
  useWorkspaces,
} from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

import { FolderTree } from "./folder-tree";
import { DocumentEditor } from "./document-editor";
import { VersionHistory } from "./version-history";
import { MemberManager } from "./member-manager";
import { KnowledgeBase } from "./knowledge-base";
import { CommentsPanel } from "./comments-panel";
import { WorkspaceDashboard } from "./workspace-dashboard";
import { WorkspaceSearch } from "./workspace-search";

type Tab = "dashboard" | "documents" | "members" | "knowledge";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "members", label: "Members", icon: Users },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
];

export function WorkspaceView() {
  const workspacesQuery = useWorkspaces();
  const createWsMutation = useCreateWorkspace();
  const { toast } = useToast();

  const [activeWorkspaceId, setActiveWorkspaceId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("dashboard");
  const [activeFolderId, setActiveFolderId] = React.useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = React.useState<string | null>(null);
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Pick the first workspace once the list loads.
  React.useEffect(() => {
    if (
      activeWorkspaceId === null &&
      workspacesQuery.data &&
      workspacesQuery.data.length > 0
    ) {
      setActiveWorkspaceId(workspacesQuery.data[0].id);
    }
  }, [activeWorkspaceId, workspacesQuery.data]);

  const [newWsOpen, setNewWsOpen] = React.useState(false);
  const [newWsName, setNewWsName] = React.useState("");
  const [newWsDescription, setNewWsDescription] = React.useState("");

  const handleCreateWs = React.useCallback(async () => {
    try {
      const ws = await createWsMutation.mutateAsync({
        name: newWsName,
        description: newWsDescription || null,
      });
      toast({ title: "Workspace created" });
      setActiveWorkspaceId(ws.id);
      setNewWsOpen(false);
      setNewWsName("");
      setNewWsDescription("");
      setActiveTab("dashboard");
    } catch (err) {
      toast({
        title: "Failed to create workspace",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createWsMutation, newWsName, newWsDescription, toast]);

  if (workspacesQuery.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (workspacesQuery.isError) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Couldn't load workspaces"
        description="Please try again later."
        className="m-4"
      />
    );
  }

  if (!workspacesQuery.data || workspacesQuery.data.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <EmptyState
          icon={Briefcase}
          title="Welcome to Workspaces"
          description="Create your first workspace to start collaborating on documents, knowledge, and files with your team."
          action={
            <CreateWorkspaceButton
              open={newWsOpen}
              onOpenChange={setNewWsOpen}
              name={newWsName}
              description={newWsDescription}
              onNameChange={setNewWsName}
              onDescriptionChange={setNewWsDescription}
              onSubmit={handleCreateWs}
              isSubmitting={createWsMutation.isPending}
            />
          }
        />
      </div>
    );
  }

  const activeWorkspace =
    workspacesQuery.data.find((w) => w.id === activeWorkspaceId) ??
    workspacesQuery.data[0];

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Briefcase
            className="size-5 shrink-0 text-emerald-500"
            aria-hidden="true"
          />
          <select
            aria-label="Active workspace"
            value={activeWorkspace.id}
            onChange={(e) => {
              setActiveWorkspaceId(e.target.value);
              setActiveFolderId(null);
              setActiveDocumentId(null);
              setActiveTab("dashboard");
            }}
            className="h-9 min-w-0 flex-1 max-w-xs truncate rounded-md border bg-background px-3 text-sm"
          >
            {workspacesQuery.data.map((w: Workspace) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="size-3.5" aria-hidden="true" />
            Search
          </Button>
          <CreateWorkspaceButton
            open={newWsOpen}
            onOpenChange={setNewWsOpen}
            name={newWsName}
            description={newWsDescription}
            onNameChange={setNewWsName}
            onDescriptionChange={setNewWsDescription}
            onSubmit={handleCreateWs}
            isSubmitting={createWsMutation.isPending}
          />
        </div>
      </header>

      {/* Tab bar */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b bg-background/95 px-3 py-1.5 scrollbar-thin">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" ? (
          <div className="p-4 sm:p-6 lg:p-8">
            <WorkspaceDashboard
              workspaceId={activeWorkspace.id}
              onOpenDocument={(docId) => {
                setActiveDocumentId(docId);
                setActiveTab("documents");
              }}
            />
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <DocumentsPane
            workspaceId={activeWorkspace.id}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            activeDocumentId={activeDocumentId}
            onSelectDocument={setActiveDocumentId}
          />
        ) : null}

        {activeTab === "members" ? (
          <div className="p-4 sm:p-6 lg:p-8">
            <MemberManager workspaceId={activeWorkspace.id} />
          </div>
        ) : null}

        {activeTab === "knowledge" ? (
          <div className="p-4 sm:p-6 lg:p-8">
            <KnowledgeBase workspaceId={activeWorkspace.id} />
          </div>
        ) : null}
      </div>

      <WorkspaceSearch
        workspaceId={activeWorkspace.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(kind, id) => {
          if (kind === "document") {
            setActiveDocumentId(id);
            setActiveTab("documents");
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-workspace dialog trigger + content
// ---------------------------------------------------------------------------

interface CreateWorkspaceButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function CreateWorkspaceButton({
  open,
  onOpenChange,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  onSubmit,
  isSubmitting,
}: CreateWorkspaceButtonProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="size-3.5" aria-hidden="true" />
          New workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Workspace name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "Creating…" : "Create workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Documents pane (split layout)
// ---------------------------------------------------------------------------

interface DocumentsPaneProps {
  workspaceId: string;
  activeFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  activeDocumentId: string | null;
  onSelectDocument: (documentId: string | null) => void;
}

function DocumentsPane({
  workspaceId,
  activeFolderId,
  onSelectFolder,
  activeDocumentId,
  onSelectDocument,
}: DocumentsPaneProps) {
  const foldersQuery = useFolders(workspaceId);
  const docsQuery = useDocuments(workspaceId, {
    folderId: activeFolderId,
  });
  const documentQuery = useDocument(workspaceId, activeDocumentId);
  const createDocMutation = useCreateDocument();
  const updateDocMutation = useUpdateDocument();
  const deleteDocMutation = useDeleteDocument();
  const createFolderMutation = useCreateFolder();
  const { toast } = useToast();

  const handleNewDocument = React.useCallback(async () => {
    try {
      const doc = await createDocMutation.mutateAsync({
        workspaceId,
        input: {
          title: "Untitled document",
          content: "",
          folderId: activeFolderId ?? undefined,
        },
      });
      onSelectDocument(doc.id);
    } catch (err) {
      toast({
        title: "Failed to create document",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [createDocMutation, workspaceId, activeFolderId, onSelectDocument, toast]);

  const handleNewFolder = React.useCallback(
    async (parentId?: string | null) => {
      const name = window.prompt("Folder name");
      if (!name) return;
      try {
        await createFolderMutation.mutateAsync({
          workspaceId,
          input: { name, parentId: parentId ?? null },
        });
      } catch (err) {
        toast({
          title: "Failed to create folder",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [createFolderMutation, workspaceId, toast],
  );

  const handleSave = React.useCallback(
    async (input: { title: string; content: string | null }) => {
      if (!activeDocumentId) return;
      try {
        await updateDocMutation.mutateAsync({
          workspaceId,
          docId: activeDocumentId,
          input,
        });
        toast({ title: "Document saved" });
      } catch (err) {
        toast({
          title: "Failed to save document",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [updateDocMutation, workspaceId, activeDocumentId, toast],
  );

  const handleDelete = React.useCallback(async () => {
    if (!activeDocumentId) return;
    if (!window.confirm("Delete this document? This cannot be undone.")) {
      return;
    }
    try {
      await deleteDocMutation.mutateAsync({
        workspaceId,
        docId: activeDocumentId,
      });
      onSelectDocument(null);
      toast({ title: "Document deleted" });
    } catch (err) {
      toast({
        title: "Failed to delete document",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [deleteDocMutation, workspaceId, activeDocumentId, onSelectDocument, toast]);

  return (
    <div className="flex h-full">
      {/* Left: folders + documents */}
      <aside className="hidden w-72 shrink-0 flex-col gap-3 border-r bg-background/40 p-3 sm:flex">
        <FolderTree
          folders={foldersQuery.data ?? []}
          activeFolderId={activeFolderId}
          onSelectFolder={onSelectFolder}
          onCreateFolder={handleNewFolder}
          isLoading={foldersQuery.isLoading}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Documents
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleNewDocument}
            disabled={createDocMutation.isPending}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            New
          </Button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto">
          {docsQuery.isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : docsQuery.data && docsQuery.data.length > 0 ? (
            docsQuery.data.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelectDocument(d.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    activeDocumentId === d.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground/80",
                  )}
                >
                  <FileText
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">{d.title}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-2 text-xs text-muted-foreground">
              No documents here yet.
            </li>
          )}
        </ul>
        {activeDocumentId ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 justify-start gap-1.5 text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={deleteDocMutation.isPending}
          >
            Delete document
          </Button>
        ) : null}
      </aside>

      {/* Center: editor */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <DocumentEditor
          document={documentQuery.data ?? null}
          isLoading={documentQuery.isLoading}
          onSave={handleSave}
          isSaving={updateDocMutation.isPending}
        />
      </div>

      {/* Right: version history + comments */}
      {activeDocumentId ? (
        <div className="hidden lg:flex">
          <VersionHistory
            workspaceId={workspaceId}
            documentId={activeDocumentId}
          />
          <CommentsPanel
            workspaceId={workspaceId}
            documentId={activeDocumentId}
          />
        </div>
      ) : null}
    </div>
  );
}
