import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { ExpenseTracker } from "@/components/business/expense-tracker";

export default async function ExpensesPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ExpenseTracker workspaceId={workspaceId} />
    </div>
  );
}
