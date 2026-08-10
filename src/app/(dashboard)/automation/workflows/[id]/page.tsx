import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { WorkflowDetails } from "@/components/automation/workflow-details";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { id } = await params;
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <WorkflowDetails workflowId={id} workspaceId={workspaceId} />;
}
