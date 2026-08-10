import { redirect } from "next/navigation";
import { resolveWorkspaceId } from "@/lib/workspace-resolver";
import { CalendarView } from "@/components/business/calendar-view";

export default async function CalendarPage() {
  const workspaceId = await resolveWorkspaceId();
  if (!workspaceId) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CalendarView workspaceId={workspaceId} />
    </div>
  );
}
