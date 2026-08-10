import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { InventoryDashboard } from "@/components/business/inventory-dashboard";

export default async function ProductsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InventoryDashboard workspaceId={workspaceId} />
    </div>
  );
}
