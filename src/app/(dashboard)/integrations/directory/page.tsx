import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { IntegrationDirectory } from "@/components/integration-hub/integration-directory";

export default async function DirectoryPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <IntegrationDirectory workspaceId={workspaceId} />
    </div>
  );
}
