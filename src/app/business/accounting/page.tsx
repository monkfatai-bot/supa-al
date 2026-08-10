import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { FinancialDashboardView } from "@/components/business/financial-dashboard";

export default async function AccountingPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FinancialDashboardView workspaceId={workspaceId} />
    </div>
  );
}
