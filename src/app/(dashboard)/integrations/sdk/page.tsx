import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { requireAuth } from "@/services/auth/session";
import { SdkConsole } from "@/components/integration-hub/sdk-console";

export default async function SdkPage() {
  const [workspaceId, profile] = await Promise.all([
    resolveWorkspaceId(),
    requireAuth(),
  ]);

  if (!workspaceId) redirect("/dashboard");

  const isAdmin = profile.app_role === "admin";

  return (
    <div className="p-6">
      <SdkConsole workspaceId={workspaceId} isAdmin={isAdmin} />
    </div>
  );
}
