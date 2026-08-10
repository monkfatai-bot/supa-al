import { requireAuth } from "@/services/auth/session";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SchedulerTick } from "@/components/automation/scheduler-tick";

export default async function AutomationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAuth();

  return (
    <SidebarProvider>
      <AppSidebar userName={profile.full_name} avatarUrl={profile.avatar_url} />
      <SidebarInset>
        <SchedulerTick enabled />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
