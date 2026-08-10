import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ExtensionManager } from "@/components/integration-hub/extension-manager";

export default async function ExtensionsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <ExtensionManager workspaceId={workspaceId} />
    </div>
  );
}
