import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeCollaborationPanel } from "@/components/employee/employee-collaboration-panel";

export default async function EmployeeCollaborationPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeCollaborationPanel workspaceId={workspaceId} />;
}
