"use client";

import { useParams } from "next/navigation";
import { FileExplorer } from "@/components/workspace/file-explorer";

export default function FilesPage() {
  const params = useParams<{ id: string }>();
  return <FileExplorer workspaceId={params.id} folderId={null} />;
}
