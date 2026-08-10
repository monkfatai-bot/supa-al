import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeeMarketplace } from "@/components/employee/employee-marketplace";

export default async function EmployeeMarketplacePage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeeMarketplace workspaceId={workspaceId} />;
}
