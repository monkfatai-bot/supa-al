import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { LogsViewer } from "@/components/automation/logs-viewer";

interface Props {
  params: Promise<{ id: string; runId: string }>;
}

export default async function RunLogsPage({ params }: Props) {
  const { id, runId } = await params;
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <LogsViewer workspaceId={workspaceId} workflowId={id} runId={runId} />;
}
