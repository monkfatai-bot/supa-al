"use client";

import { useParams } from "next/navigation";
import { WorkspaceSettings } from "@/components/workspace/workspace-settings";

export default function WorkspaceSettingsPage() {
  const params = useParams<{ id: string }>();
  return <WorkspaceSettings workspaceId={params.id} />;
}
