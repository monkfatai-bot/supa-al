import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Calendar,
  Clock,
  Shield,
  User,
} from "lucide-react";
import type { Profile } from "@/types/generated/database";

interface OverviewStatsProps {
  profile: Profile;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? "s" : ""} ago`;
}

export function OverviewStats({ profile }: OverviewStatsProps) {
  const stats = [
    {
      title: "Account Status",
      value: "Active",
      description: "Your account is fully verified and active",
      icon: Shield,
    },
    {
      title: "Member Since",
      value: formatDate(profile.created_at),
      description: getTimeAgo(profile.created_at),
      icon: Calendar,
    },
    {
      title: "Last Updated",
      value: getTimeAgo(profile.updated_at),
      description: formatDate(profile.updated_at),
      icon: Clock,
    },
    {
      title: "Profile",
      value: profile.full_name ?? "Not set",
      description: profile.full_name ? "Display name configured" : "Set up your display name",
      icon: User,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {stat.title}
            </CardTitle>
            <stat.icon className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-muted-foreground text-xs">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
