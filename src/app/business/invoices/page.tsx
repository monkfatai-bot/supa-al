import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { InvoiceEditor } from "@/components/business/invoice-editor";

export default async function InvoicesPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InvoiceEditor workspaceId={workspaceId} />
    </div>
  );
}
