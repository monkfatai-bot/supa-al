import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { BusinessSettings } from "@/components/business/business-settings";

export default async function SettingsPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <BusinessSettings workspaceId={workspaceId} />
    </div>
  );
}
