import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ApiKeyManager } from "@/components/integration-hub/api-key-manager";

export default async function ApiKeysPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <ApiKeyManager workspaceId={workspaceId} />
    </div>
  );
}
