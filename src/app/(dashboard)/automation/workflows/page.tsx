import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { WorkflowList } from "@/components/automation/workflow-list";

export default async function WorkflowsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <WorkflowList workspaceId={workspaceId} />;
}
