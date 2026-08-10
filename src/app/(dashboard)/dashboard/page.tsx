import { requireAuth } from "@/services/auth/session";
import { getActivityLogs } from "@/services/activity-log/actions";
import { OverviewStats } from "@/components/dashboard/overview-stats";
import { WelcomeCard } from "@/components/dashboard/welcome-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { UserCog, MessageSquare } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Dashboard",
  description: "Your Supa AI workspace overview.",
};

export default async function DashboardPage() {
  const profile = await requireAuth();
  const logs = await getActivityLogs(10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground">
          A summary of your account and platform activity.
        </p>
      </div>

      <WelcomeCard profile={profile} />
      <OverviewStats profile={profile} />

      <div className="grid gap-4 lg:grid-cols-7">
        <div className="lg:col-span-4">
          <ActivityFeed logs={logs} />
        </div>
        <div className="lg:col-span-3">
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h3 className="mb-4 text-lg font-semibold">Quick Actions</h3>
      <p className="text-muted-foreground mb-6 text-sm">
        Common actions you can take right now.
      </p>
      <div className="space-y-3">
        <Link
          href="/dashboard/settings"
          className="bg-muted hover:bg-accent flex items-center gap-3 rounded-lg p-3 transition-colors"
        >
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Edit Profile</p>
            <p className="text-muted-foreground text-xs">
              Update your display name and avatar
            </p>
          </div>
        </Link>
        <Link
          href="/chat"
          className="bg-muted hover:bg-accent flex items-center gap-3 rounded-lg p-3 transition-colors"
        >
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Start Chat</p>
            <p className="text-muted-foreground text-xs">
              Talk with AI assistants
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
