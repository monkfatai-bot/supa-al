import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { EmployeePerformanceDashboard } from "@/components/employee/employee-performance-dashboard";

export default async function EmployeePerformancePage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return <EmployeePerformanceDashboard workspaceId={workspaceId} />;
}
