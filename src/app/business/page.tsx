import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { BusinessDashboard } from "@/components/business/business-dashboard";

export default async function BusinessPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BusinessDashboard workspaceId={workspaceId} />
    </div>
  );
}
