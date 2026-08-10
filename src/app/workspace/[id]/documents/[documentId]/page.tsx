"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentEditor } from "@/components/workspace/document-editor";
import { CommentsPanel } from "@/components/workspace/comments-panel";

export default function DocumentEditorPage() {
  const params = useParams<{ id: string; documentId: string }>();
  const workspaceId = params.id;
  const documentId = params.documentId;
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-hidden ${commentsOpen ? "mr-80" : ""}`}>
        <DocumentEditor documentId={documentId} workspaceId={workspaceId} />
      </div>
      {commentsOpen && (
        <aside className="w-80 shrink-0 border-l overflow-hidden">
          <CommentsPanel documentId={documentId} workspaceId={workspaceId} />
        </aside>
      )}
      <Button
        variant="outline"
        size="icon"
        className="fixed right-4 bottom-4 z-10 h-10 w-10 rounded-full shadow-lg"
        onClick={() => setCommentsOpen(!commentsOpen)}
      >
        <MessageSquare className="h-4 w-4" />
      </Button>
    </div>
  );
}
