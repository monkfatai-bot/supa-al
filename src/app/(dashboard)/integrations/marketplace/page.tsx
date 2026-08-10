import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { MarketplaceHome } from "@/components/integration-hub/marketplace-home";

export default async function MarketplacePage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="p-6">
      <MarketplaceHome workspaceId={workspaceId} />
    </div>
  );
}
