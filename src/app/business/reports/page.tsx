import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ReportsDashboard } from "@/components/business/reports-dashboard";

export default async function ReportsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ReportsDashboard workspaceId={workspaceId} />
    </div>
  );
}
