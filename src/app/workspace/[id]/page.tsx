"use client";

import { useParams } from "next/navigation";
import { WorkspaceDashboard } from "@/components/workspace/workspace-dashboard";

export default function WorkspaceDashboardPage() {
  const params = useParams<{ id: string }>();
  return <WorkspaceDashboard workspaceId={params.id} />;
}
