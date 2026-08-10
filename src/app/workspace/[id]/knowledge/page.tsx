"use client";

import { useParams } from "next/navigation";
import { KnowledgeViewer } from "@/components/workspace/knowledge-viewer";

export default function KnowledgePage() {
  const params = useParams<{ id: string }>();
  return <KnowledgeViewer workspaceId={params.id} />;
}
