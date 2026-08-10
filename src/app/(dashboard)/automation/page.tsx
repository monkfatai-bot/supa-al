import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { AutomationDashboard } from "@/components/automation/automation-dashboard";

export default async function AutomationPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <AutomationDashboard workspaceId={workspaceId} />;
}
