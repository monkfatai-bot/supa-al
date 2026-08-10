import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { IntegrationHubDashboard } from "@/components/integration-hub/integration-hub-dashboard";

export default async function IntegrationsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationHubDashboard workspaceId={workspaceId} />
    </div>
  );
}
