"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FolderTree } from "@/components/workspace/folder-tree";
import { DocumentList } from "@/components/workspace/document-list";
import { createDocument } from "@/services/document";

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceId = params.id;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  async function handleCreateDocument() {
    const res = await createDocument(workspaceId, undefined, undefined, undefined, selectedFolderId ?? undefined);
    if (res.success && res.document) {
      router.push(`/workspace/${workspaceId}/documents/${res.document.id}`);
    }
  }

  return (
    <div className="flex h-full">
      <aside className="w-64 shrink-0 border-r">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b p-3">
            <span className="text-sm font-medium">Folders</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCreateDocument}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <FolderTree
              workspaceId={workspaceId}
              selectedFolderId={selectedFolderId}
              onFolderSelect={setSelectedFolderId}
            />
          </div>
        </div>
      </aside>
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Documents</h2>
          <Button size="sm" onClick={handleCreateDocument}>
            <Plus className="mr-1 h-4 w-4" />
            New Document
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <DocumentList workspaceId={workspaceId} folderId={selectedFolderId} />
        </div>
      </main>
    </div>
  );
}
