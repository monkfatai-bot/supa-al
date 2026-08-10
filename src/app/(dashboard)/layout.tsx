import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { UserMenu } from "@/components/dashboard/user-menu";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { requireAuth, getAuthUser } from "@/services/auth/session";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const [profile, authUser] = await Promise.all([requireAuth(), getAuthUser()]);

  return (
    <SidebarProvider>
      <AppSidebar
        userName={profile.full_name}
        avatarUrl={profile.avatar_url}
      />
      <SidebarInset>
        <div className="flex items-center justify-between px-4 py-2 md:px-6">
          <DashboardHeader title="Dashboard" />
          <NotificationBell />
          <UserMenu
            userName={profile.full_name}
            userEmail={authUser?.email ?? null}
            avatarUrl={profile.avatar_url}
          />
        </div>
        <div className="flex flex-1 flex-col gap-4 px-4 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}