import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { OAuthManager } from "@/components/integration-hub/oauth-manager";

export default async function OAuthPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <OAuthManager workspaceId={workspaceId} />
    </div>
  );
}
