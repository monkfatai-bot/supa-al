import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { IntegrationLogs } from "@/components/integration-hub/integration-logs";

export default async function LogsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationLogs workspaceId={workspaceId} />
    </div>
  );
}
