import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { AnalyticsDashboard } from "@/components/integration-hub/analytics-dashboard";

export default async function AnalyticsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <AnalyticsDashboard workspaceId={workspaceId} />
    </div>
  );
}
