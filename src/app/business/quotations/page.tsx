import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { QuotationEditor } from "@/components/business/quotation-editor";

export default async function QuotationsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <QuotationEditor workspaceId={workspaceId} />
    </div>
  );
}
